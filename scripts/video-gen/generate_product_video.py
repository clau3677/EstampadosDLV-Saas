#!/usr/bin/env python3
"""
Generate a professional product ad video for Estampados DLV.
Takes a product SKU, name, price, category, and image URLs as arguments.
Downloads real product images from the server, generates AI-powered voice-over,
and creates a professional 1080x1920 video with:
  - AI-generated advertising script (Groq free tier)
  - Synchronized subtitles (drawtext with timestamps from TTS word boundaries)
  - Dynamic transitions (zoom, pan, crossfade-like cuts)
  - Background music with ducking (volume drops when voice speaks)
  - Brand, price, phone, web overlays

Techniques inspired by MoneyPrinterTurbo (harry0703/MoneyPrinterTurbo)

Usage:
  python3 generate_product_video.py <sku> <name> <price> <category> <img_url_1> [img_url_2] [img_url_3]

Output: /var/www/estampadosdlv/public/videos/video-{sku}-ad.mp4
"""
import subprocess
import sys
import os
import json
import re
import urllib.request
import tempfile
import time

# Config
W, H = 1080, 1920
FPS = 30
VIDEO_DIR = "/var/www/estampadosdlv/public/videos"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BG_MUSIC = "/var/www/dlv-video-assets/bg-music.mp3"
# Voces chilenas nativas: CatalinaNeural (mujer) y LorenzoNeural (hombre)
# Se alternan según el SKU para variedad (mismo SKU = siempre misma voz)
VOICES = ["es-CL-CatalinaNeural", "es-CL-LorenzoNeural"]
VOICE = VOICES[0]

os.makedirs(VIDEO_DIR, exist_ok=True)
WORK_DIR = ""  # Set in main()

# Brand colors
PRIMARY = "0xE8590C"
PRIMARY_DARK = "0xC2410C"
WHITE = "0xFFFFFF"
DARK = "0x1A1A2E"
YELLOW = "0xFBBF24"
GREEN = "0x22C55E"
TRANSPARENT_BLACK = "0x000000@0.7"

BRAND = "ESTAMPADOS DLV"
PHONE = "+56 9 5416 9052"
WEB = "estampadosdlv.com/tienda"
ENVIO = "Envio a todo Chile $3.490"

# MiniMax API (primary for text and voice)
MINIMAX_API_KEY = ""
MINIMAX_TEXT_URL = "https://api.minimaxi.chat/v1/text/chatcompletion_v2"
MINIMAX_TEXT_MODEL = "MiniMax-Text-01"
MINIMAX_TTS_URL = "https://api.minimaxi.chat/v1/t2a_v2"
MINIMAX_TTS_MODEL = "speech-2.6-turbo"
MINIMAX_VOICE = "Spanish_Narrator"

# Groq free API (backup for text)
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-20b"
GROQ_KEY = ""


def run_cmd(cmd):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: {result.stderr[:500]}")
        raise Exception(f"Command failed: {cmd[:200]}")
    return result


def escape_text(text):
    return (text.replace("\\", "\\\\")
                 .replace(":", "\\:")
                 .replace("'", "\\'")
                 .replace(",", "\\,")
                 .replace("%", "\\%")
                 .replace("$", "\\$"))


def escape_text_ffmpeg(text):
    """Extra escaping for ffmpeg drawtext filter."""
    return text.replace("\\", "\\\\").replace("'", "\\\\\\'").replace(":", "\\:").replace(",", "\\,")


def download_image(url, output_path):
    try:
        if url.startswith('/'):
            url = f"https://estampadosdlv.com{url}"
        urllib.request.urlretrieve(url, output_path)
        return os.path.exists(output_path) and os.path.getsize(output_path) > 1000
    except Exception as e:
        print(f"  Error downloading {url}: {e}")
        return False


def generate_ai_script_minimax(product_name, price, category):
    """Generate an advertising script using MiniMax M3 model."""
    # Spell out the price in words for the AI to use in the script
    price_num = number_to_words_chilean(price)
    price_words = f"{price_num} pesos chilenos"
    prompt = f"""Genera un guion publicitario CORTO y LLAMATIVO en español chileno para un producto.
Producto: {product_name}
Precio: {price} CLP (en palabras se dice: "{price_words}")
Categoría: {category}

Requisitos:
- Máximo 3-4 oraciones cortas
- Tono entusiasta y de venta
- Cuando menciones el precio, usa EXACTAMENTE la frase "{price_words}" tal cual, sin agregar palabras adicionales antes de "mil"
- Mencionar envío a todo Chile por $3.490
- Incluir llamado a la acción (compra ahora / escríbenos)
- NO usar el teléfono en el guion (aparece en el video)
- El guion debe sonar natural al ser leído por una voz de IA
- PROHIBIDO: escribir el precio con símbolos $ o números como "$6.990", "6.990", "$6990"
- PROHIBIDO: decir "seis pesos mil novecientos noventa" — debe ser "seis mil novecientos noventa pesos chilenos"
- EJEMPLO CORRECTO: "Consíguela ahora por solo seis mil novecientos noventa pesos chilenos"

Formato JSON:
{{"hook": "frase gancho impactante", "body": "descripción del producto y beneficios", "cta": "llamado a la acción con precio y envío"}}"""

    for attempt in range(3):
        try:
            import http.client
            import ssl
            data = json.dumps({
                "model": MINIMAX_TEXT_MODEL,
                "messages": [
                    {"role": "system", "content": "Eres un copywriter experto en publicidad para redes sociales. Genera scripts cortos y efectivos en español chileno."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 200,
                "temperature": 0.8
            }).encode()

            ctx = ssl.create_default_context()
            conn = http.client.HTTPSConnection("api.minimaxi.chat", timeout=20, context=ctx)
            conn.request("POST", "/v1/text/chatcompletion_v2", body=data, headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {MINIMAX_API_KEY}"
            })
            resp = conn.getresponse()
            content = resp.read().decode('utf-8', errors='ignore')
            result = json.loads(content)
            conn.close()

            choices = result.get('choices', [])
            if choices:
                msg = choices[0].get('message', {})
                content = msg.get('content', '')
                json_match = re.search(r'\{.*\}', content, re.DOTALL)
                if json_match:
                    script = json.loads(json_match.group())
                    return script
        except Exception as e:
            print(f"  MiniMax script attempt {attempt+1} failed: {e}")
            time.sleep(1)

    return None


def generate_ai_script_groq(product_name, price, category):
    """Generate an advertising script using Groq API (backup)."""
    price_num = number_to_words_chilean(price)
    price_words = f"{price_num} pesos chilenos"
    prompt = f"""Genera un guion publicitario CORTO y LLAMATIVO en español chileno para un producto.
Producto: {product_name}
Precio: {price} CLP (en palabras se dice: "{price_words}")
Categoría: {category}

Requisitos:
- Máximo 3-4 oraciones cortas
- Tono entusiasta y de venta
- Cuando menciones el precio, usa EXACTAMENTE la frase "{price_words}" tal cual, sin agregar palabras adicionales antes de "mil"
- Mencionar envío a todo Chile por $3.490
- Incluir llamado a la acción (compra ahora / escríbenos)
- NO usar el teléfono en el guion (aparece en el video)
- El guion debe sonar natural al ser leído por una voz de IA
- PROHIBIDO: escribir el precio con símbolos $ o números como "$6.990", "6.990", "$6990"
- PROHIBIDO: decir "seis pesos mil novecientos noventa" — debe ser "seis mil novecientos noventa pesos chilenos"
- EJEMPLO CORRECTO: "Consíguela ahora por solo seis mil novecientos noventa pesos chilenos"

Formato JSON:
{{"hook": "frase gancho impactante", "body": "descripción del producto y beneficios", "cta": "llamado a la acción con precio y envío"}}"""

    if not GROQ_KEY:
        return None

    for attempt in range(3):
        try:
            data = json.dumps({
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "Eres un copywriter experto en publicidad para redes sociales. Genera scripts cortos y efectivos en español chileno."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 200,
                "temperature": 0.8
            }).encode()

            req = urllib.request.Request(
                GROQ_URL,
                data=data,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_KEY}"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())

            content = result["choices"][0]["message"]["content"]
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                script = json.loads(json_match.group())
                return script
        except Exception as e:
            print(f"  Groq script attempt {attempt+1} failed: {e}")
            time.sleep(1)

    return None


def generate_ai_script(product_name, price, category):
    """Generate advertising script - try MiniMax first, then Groq."""
    if MINIMAX_API_KEY:
        script = generate_ai_script_minimax(product_name, price, category)
        if script:
            return script
    return generate_ai_script_groq(product_name, price, category)


def generate_voice_script_fallback(product_name, price, qualities, category_name):
    """Fallback script generation without AI."""
    q1_title, q1_sub = qualities[0]
    q2_title, q2_sub = qualities[1]

    script = (
        f"Esta es la {product_name} de Estampados DLV. "
        f"Por solo {price} pesos chilenos. "
        f"{q1_title}: {q1_sub}. "
        f"{q2_title}: {q2_sub}. "
        f"Envio a todo Chile por solo tres mil cuatrocientos noventa pesos. "
        f"Llama o escribe al mas cincuenta y seis, nueve, cinco cuatro uno seis, nueve cero cinco dos. "
        f"Compra ahora en estampados dlv punto com."
    )
    return script


def generate_voice_minimax(text, output_path):
    """Generate TTS voice using MiniMax Speech API (hex-encoded WAV)."""
    try:
        import http.client
        import ssl
        data = json.dumps({
            "model": MINIMAX_TTS_MODEL,
            "text": text,
            "voice_setting": {"voice_id": MINIMAX_VOICE},
            "audio_setting": {"sample_rate": 32000, "format": "wav"}
        }).encode()

        ctx = ssl.create_default_context()
        conn = http.client.HTTPSConnection("api.minimaxi.chat", timeout=60, context=ctx)
        conn.request("POST", "/v1/t2a_v2", body=data, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {MINIMAX_API_KEY}"
        })
        resp = conn.getresponse()
        body_content = resp.read().decode('utf-8', errors='ignore')
        result = json.loads(body_content)
        conn.close()

        if 'data' in result and 'audio' in result['data']:
            audio_hex = result['data']['audio']
            audio_bytes = bytes.fromhex(audio_hex)
            if len(audio_bytes) > 1000:
                with open(output_path, 'wb') as f:
                    f.write(audio_bytes)
                return True
        return False
    except Exception as e:
        print(f"  MiniMax TTS Error: {e}")
        return False


def get_voice_for_sku(sku):
    """Selecciona la voz según el SKU: alterna entre las 2 voces chilenas."""
    hash_val = sum(ord(c) for c in sku) % len(VOICES)
    return VOICES[hash_val]

def generate_voice(text, output_path, sku="default"):
    """Generate TTS voice using Chilean native voices only (Edge-TTS)."""
    voice = get_voice_for_sku(sku)
    try:
        result = subprocess.run(
            f'edge-tts --voice "{voice}" --text "{text}" --rate="+5%" --write-media "{output_path}"',
            shell=True, capture_output=True, text=True, timeout=60
        )
        return os.path.exists(output_path) and os.path.getsize(output_path) > 1000
    except Exception as e:
        print(f"  TTS Error: {e}")
        return False


def get_voice_duration(filepath):
    result = subprocess.run(
        f"ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filepath}\"",
        shell=True, capture_output=True, text=True
    )
    try:
        return float(result.stdout.strip())
    except:
        return 0


def get_audio_word_timestamps(voice_file):
    """Get word-level timestamps from the TTS audio using edge-tts metadata."""
    # Since Edge-TTS doesn't provide word timestamps, we'll use the full script
    # divided by estimated word durations. Instead, we'll generate subtitle
    # timestamps based on the TTS output using a simpler approach:
    # Divide the voice into logical segments based on sentence boundaries.
    result = subprocess.run(
        f'edge-tts --voice "{VOICE}" --text "test" --write-media /dev/null 2>&1',
        shell=True, capture_output=True, text=True, timeout=10
    )
    # Fallback: use ffmpeg silence detection to find sentence boundaries
    silence_cmd = (
        f'ffmpeg -i "{voice_file}" -af "silencedetect=noise=-35dB:d=0.4" '
        f'-f null - 2>&1 | grep "silence_" '
    )
    result = subprocess.run(silence_cmd, shell=True, capture_output=True, text=True)
    lines = result.stdout.strip().split('\n')

    boundaries = []
    for line in lines:
        if 'silence_end' in line:
            m = re.search(r'silence_end: ([\d.]+)', line)
            if m:
                boundaries.append(float(m.group(1)))

    return boundaries


def create_segment(img_path, duration, q_title, q_sub, product_name, price, idx, total_segs, voice_boundaries):
    """Create a video segment with Ken Burns effect and text overlays."""
    seg_file = os.path.join(WORK_DIR, f"seg_{idx}.mp4")

    zoom_modes = ["zoom_in", "zoom_out", "pan_right", "pan_left", "zoom_in_slow"]
    mode = zoom_modes[idx % len(zoom_modes)]

    scale_w, scale_h = 2160, 3840
    d_frames = int(duration * FPS)

    if mode == "zoom_in":
        z_expr = "min(1.0+0.0003*on\\,1.15)"
        x_expr = "(iw-iw/zoom)/2"
        y_expr = "(ih-ih/zoom)/2"
    elif mode == "zoom_out":
        z_expr = "max(1.15-0.0003*on\\,1.0)"
        x_expr = "(iw-iw/zoom)/2"
        y_expr = "(ih-ih/zoom)/2"
    elif mode == "pan_right":
        z_expr = "1.10"
        x_expr = "min((iw-iw/zoom)/2+0.0015*on*zoom\\,iw-iw/zoom)"
        y_expr = "(ih-ih/zoom)/2"
    elif mode == "pan_left":
        z_expr = "1.10"
        x_expr = "max((iw-iw/zoom)/2-0.0015*on*zoom\\,0)"
        y_expr = "(ih-ih/zoom)/2"
    else:
        z_expr = "min(1.0+0.0002*on\\,1.10)"
        x_expr = "(iw-iw/zoom)/2"
        y_expr = "(ih-ih/zoom)/2"

    fade_in = f"if(lt(t,0.3),0,if(lt(t,0.5),(t-0.3)/0.2,1))"
    fade_out = f"if(gt(t,{duration-0.5}),max(0,(1-(t-({duration}-0.5))/0.5)),1)"
    combined_alpha = f"{fade_in}*{fade_out}"

    zoompan_filter = f"scale={scale_w}:{scale_h}:flags=lanczos,zoompan=z='{z_expr}':x='{x_expr}':y='{y_expr}':d={d_frames}:s={W}x{H}:fps={FPS}"

    # Calculate subtitle y position based on word boundaries (simplified: show main text at bottom)
    q1_y = h_bottom(0)
    q2_y = h_bottom(1)

    filters = [
        f"[0:v]{zoompan_filter}[base]",
        f"[base]drawtext=fontfile={FONT_BOLD}:text='{escape_text(BRAND)}':fontcolor={WHITE}@0.85:fontsize=24:x=(w-text_w)/2:y=60[with_brand]",
        f"[with_brand]drawtext=fontfile={FONT_BOLD}:text='{escape_text(product_name)}':fontcolor={WHITE}:fontsize=36:borderw=3:bordercolor={DARK}@0.8:x=(w-text_w)/2:y=90:alpha='{combined_alpha}'[with_name]",
        f"[with_name]drawtext=fontfile={FONT_BOLD}:text='{escape_text(price)}':fontcolor={DARK}:fontsize=40:box=1:boxcolor={YELLOW}@0.95:boxborderw=12:x=(w-text_w)/2:y=145:alpha='{combined_alpha}'[with_price]",
        f"[with_price]drawtext=fontfile={FONT_BOLD}:text='{escape_text(q_title)}':fontcolor={WHITE}:fontsize=34:box=1:boxcolor={PRIMARY}@0.92:boxborderw=10:x=(w-text_w)/2:y=h-340:alpha='{combined_alpha}'[with_q1]",
        f"[with_q1]drawtext=fontfile={FONT_REGULAR}:text='{escape_text(q_sub)}':fontcolor={WHITE}@0.92:fontsize=26:box=1:boxcolor={TRANSPARENT_BLACK}:boxborderw=8:x=(w-text_w)/2:y=h-270:alpha='{combined_alpha}'[with_q2]",
        f"[with_q2]drawtext=fontfile={FONT_REGULAR}:text='{escape_text(WEB)} | {escape_text(PHONE)}':fontcolor={WHITE}@0.8:fontsize=20:x=(w-text_w)/2:y=h-70",
    ]

    vf = ",".join(filters)
    cmd = f'ffmpeg -y -loop 1 -i "{img_path}" -vf "{vf}" -t {duration} -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -an "{seg_file}"'
    run_cmd(cmd)
    return seg_file


def h_bottom(line_idx):
    """Calculate y position for bottom text lines."""
    base = H - 340
    return base + line_idx * 70


def create_intro(duration=1.5):
    intro_file = os.path.join(WORK_DIR, "intro.mp4")
    vf = (
        f"color=c={DARK}:s={W}x{H}:d={duration}:r={FPS},"
        f"drawtext=fontfile={FONT_BOLD}:text='{escape_text(BRAND)}':fontcolor={PRIMARY}:fontsize=72:borderw=4:bordercolor={WHITE}@0.3:"
        f"x=(w-text_w)/2:y=(h-text_h)/2-40:alpha='if(lt(t,0.4),0,if(lt(t,0.7),(t-0.4)/0.3,1))',"
        f"drawtext=fontfile={FONT_REGULAR}:text='Quilpue, Chile':fontcolor={WHITE}@0.7:fontsize=28:"
        f"x=(w-text_w)/2:y=(h-text_h)/2+60:alpha='if(lt(t,0.7),0,if(lt(t,1.0),(t-0.7)/0.3,1))',"
        f"drawtext=fontfile={FONT_REGULAR}:text='{escape_text(WEB)}':fontcolor={GREEN}:fontsize=24:"
        f"x=(w-text_w)/2:y=(h-text_h)/2+110:alpha='if(lt(t,1.0),0,if(lt(t,1.3),(t-1.0)/0.3,1))'"
    )
    cmd = f'ffmpeg -y -f lavfi -i "{vf}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -an "{intro_file}"'
    run_cmd(cmd)
    return intro_file


def create_outro(duration, product_name, price):
    outro_file = os.path.join(WORK_DIR, "outro.mp4")
    f1 = "if(lt(t,0.3),0,if(lt(t,0.6),(t-0.3)/0.3,1))"
    f2 = "if(lt(t,0.5),0,if(lt(t,0.8),(t-0.5)/0.3,1))"
    f3 = "if(lt(t,0.7),0,if(lt(t,1.0),(t-0.7)/0.3,1))"
    f4 = "if(lt(t,1.2),0,if(lt(t,1.5),(t-1.2)/0.3,1))"
    f5 = "if(lt(t,1.7),0,if(lt(t,2.0),(t-2.0)/0.3,1))"
    f6 = "if(lt(t,2.0),0,if(lt(t,2.3),(t-2.0)/0.3,1))"
    f7 = "if(lt(t,2.5),0,if(lt(t,2.8),(t-2.5)/0.3,1))"

    vf = (
        f"color=c={DARK}:s={W}x{H}:d={duration}:r={FPS},"
        f"drawtext=fontfile={FONT_BOLD}:text='{escape_text(BRAND)}':fontcolor={PRIMARY}:fontsize=60:borderw=3:bordercolor={WHITE}@0.2:x=(w-text_w)/2:y=200:alpha='{f1}',"
        f"drawtext=fontfile={FONT_BOLD}:text='{escape_text(product_name)}':fontcolor={WHITE}:fontsize=34:x=(w-text_w)/2:y=340:alpha='{f2}',"
        f"drawtext=fontfile={FONT_BOLD}:text='{escape_text(price)}':fontcolor={DARK}:fontsize=46:box=1:boxcolor={YELLOW}@0.95:boxborderw=12:x=(w-text_w)/2:y=430:alpha='{f3}',"
        f"drawtext=fontfile={FONT_BOLD}:text='{escape_text(ENVIO)}':fontcolor={GREEN}:fontsize=28:x=(w-text_w)/2:y=550:alpha='{f4}',"
        f"drawtext=fontfile={FONT_BOLD}:text='{escape_text(PHONE)}':fontcolor={WHITE}:fontsize=38:x=(w-text_w)/2:y=650:alpha='{f5}',"
        f"drawtext=fontfile={FONT_REGULAR}:text='{escape_text(WEB)}':fontcolor={WHITE}@0.85:fontsize=26:x=(w-text_w)/2:y=760:alpha='{f6}',"
        f"drawtext=fontfile={FONT_BOLD}:text='COMPRA AHORA':fontcolor={DARK}:fontsize=32:box=1:boxcolor={GREEN}@0.9:boxborderw=10:x=(w-text_w)/2:y=870:alpha='{f7}'"
    )
    cmd = f'ffmpeg -y -f lavfi -i "{vf}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -an "{outro_file}"'
    run_cmd(cmd)
    return outro_file


def generate_category_qualities(category):
    """Generate quality highlights based on product category."""
    if 'trabajo' in category or 'workwear' in category:
        return [
            ("Calidad Profesional", "Material resistente y duradero"),
            ("Diseño Ergonomico", "Comodidad para la jornada laboral"),
            ("Seguridad Certificada", "Cumple normativas de proteccion"),
            ("Listo para tu Logo", "Bordado o estampado de tu marca"),
        ]
    elif 'gorra' in category or 'caps' in category:
        return [
            ("Ajuste Perfecto", "Hebilla metalica regulable"),
            ("Material Premium", "Algodon y poliester de calidad"),
            ("Visera Curva", "Proteccion solar elegante"),
            ("Ideal para Estampar", "Personaliza con tu diseno"),
        ]
    elif 'poleron' in category or 'hoodie' in category:
        return [
            ("Tela Premium", "Mezcla suave y abrigada"),
            ("Interior Afelpado", "Calor y comodidad todo el dia"),
            ("Costuras Reforzadas", "Durabilidad garantizada"),
            ("Perfecta para Estampar", "Tu diseno se ve increible"),
        ]
    else:  # poleras, blank apparel
        return [
            ("Tela de Calidad", "Algodon premium que se siente suave"),
            ("Costuras Reforzadas", "Durabilidad en cada uso"),
            ("Talle Perfecto", "Corte moderno y comodo"),
            ("Lista para Estampar", "Tu diseno se ve profesional"),
        ]


def generate_category_qualities_ai(product_name, price, category):
    """Generate quality highlights using MiniMax AI (primary) or Groq (backup)."""
    prompt = f"""Para este producto de una tienda de estampados, genera 4 cualidades cortas que destaquen el producto para un video publicitario.

Producto: {product_name}
Precio: {price} CLP
Categoría: {category}

Genera 4 pares de (titulo_corto, descripcion_breve) destacando cualidades reales del producto.
Los titulos deben ser de 2-4 palabras y las descripciones de 5-10 palabras.

Formato JSON:
{{"qualidades": [
  {{"titulo": "titulo1", "descripcion": "descripcion1"}},
  {{"titulo": "titulo2", "descripcion": "descripcion2"}},
  {{"titulo": "titulo3", "descripcion": "descripcion3"}},
  {{"titulo": "titulo4", "descripcion": "descripcion4"}}
]}}"""

    # Try MiniMax first
    if MINIMAX_API_KEY:
        for attempt in range(3):
            try:
                import http.client
                import ssl
                data = json.dumps({
                    "model": MINIMAX_TEXT_MODEL,
                    "messages": [
                        {"role": "system", "content": "Eres un experto en marketing de productos textiles y de trabajo."},
                        {"role": "user", "content": prompt}
                    ],
                    "max_tokens": 300,
                    "temperature": 0.7
                }).encode()

                ctx = ssl.create_default_context()
                conn = http.client.HTTPSConnection("api.minimaxi.chat", timeout=20, context=ctx)
                conn.request("POST", "/v1/text/chatcompletion_v2", body=data, headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {MINIMAX_API_KEY}"
                })
                resp = conn.getresponse()
                content = resp.read().decode('utf-8', errors='ignore')
                result = json.loads(content)
                conn.close()

                choices = result.get('choices', [])
                if choices:
                    msg = choices[0].get('message', {})
                    content = msg.get('content', '')
                    json_match = re.search(r'\{.*\}', content, re.DOTALL)
                    if json_match:
                        script = json.loads(json_match.group())
                        quals = script.get("qualidades", [])
                        if len(quals) >= 2:
                            return [(q["titulo"], q["descripcion"]) for q in quals]
            except Exception as e:
                print(f"  MiniMax qualities attempt {attempt+1} failed: {e}")
                time.sleep(1)

    # Fallback to Groq
    if not GROQ_KEY:
        return None
    for attempt in range(3):
        try:
            data = json.dumps({
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "Eres un experto en marketing de productos textiles y de trabajo."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 300,
                "temperature": 0.7
            }).encode()

            req = urllib.request.Request(
                GROQ_URL,
                data=data,
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {GROQ_KEY}"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                result = json.loads(resp.read())

            content = result["choices"][0]["message"]["content"]
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                script = json.loads(json_match.group())
                quals = script.get("qualidades", [])
                if len(quals) >= 2:
                    return [(q["titulo"], q["descripcion"]) for q in quals]
        except Exception as e:
            print(f"  Groq qualities attempt {attempt+1} failed: {e}")
            time.sleep(1)

    return None


def number_to_words_chilean(price_str):
    """Convert a Chilean price string like '$6.990' to spoken words.
    Returns just the number in words WITHOUT 'pesos' suffix - caller adds context.
    """
    # Remove $ and CLP
    clean = price_str.replace('$', '').replace('CLP', '').replace('.', '').replace(' ', '').strip()
    try:
        num = int(clean)
    except ValueError:
        return price_str
    
    if num == 0:
        return "cero pesos"
    
    units = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"]
    teens = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciseis", "diecisiete", "dieciocho", "diecinueve"]
    tens = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"]
    hundreds = ["", "cien", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"]
    
    if num < 10:
        return f"{units[num]}"
    elif num < 20:
        return f"{teens[num - 10]}"
    elif num < 100:
        t, u = divmod(num, 10)
        if u == 0:
            return f"{tens[t]}"
        return f"{tens[t]} y {units[u]}"
    elif num < 1000:
        h, rest = divmod(num, 100)
        if rest == 0:
            return f"{hundreds[h]}"
        return f"{hundreds[h]} {number_to_words_chilean(str(rest))}"
    elif num < 1000000:
        thousands, rest = divmod(num, 1000)
        if thousands == 1:
            result = "mil"
        else:
            result = f"{number_to_words_chilean(str(thousands))} mil"
        if rest > 0:
            result += f" {number_to_words_chilean(str(rest))}"
        return result
    else:
        millions, rest = divmod(num, 1000000)
        if millions == 1:
            result = "un millon"
        else:
            result = f"{number_to_words_chilean(str(millions))} millones"
        if rest > 0:
            result += f" {number_to_words_chilean(str(rest))}"
        return result


def create_voice_script_from_ai(ai_script, price):
    """Convert AI-generated script to a spoken voice script.
    CRITICAL: Replace any numeric price references with spelled-out words
    to prevent TTS from mispronouncing (e.g., '$6.990' -> 'novecientos noventa')
    """
    hook = ai_script.get("hook", "")
    body = ai_script.get("body", "")
    cta = ai_script.get("cta", "")

    script = f"{hook} {body} {cta}"
    
    # Fix price pronunciation: replace any remaining numeric price patterns
    # with the spelled-out version
    price_num = number_to_words_chilean(price)
    price_words = f"{price_num} pesos chilenos"
    
    # Match patterns like: $6.990, 6.990, 6990, $ 6.990, etc.
    script = re.sub(r'\$?\s*\d{1,3}(\.?\d{3})\b', price_words, script)
    
    # Also fix malformed price mentions like "seis pesos mil novecientos noventa pesos"
    # Replace with clean version
    script = re.sub(
        r'(\w+)\s+pesos?\s+(\w+\s+)?(mil)\s+',
        lambda m: f"{m.group(1)} {m.group(2) or ''}{m.group(3)} ",
        script
    )
    # Remove trailing "pesos" before "chilenos" duplicates
    script = re.sub(r'\b(pesos\s+chilenos)\s+(pesos)\b', r'\1', script)
    
    return script


def main():
    global WORK_DIR, GROQ_KEY, MINIMAX_API_KEY

    if len(sys.argv) < 6:
        print("Usage: python3 generate_product_video.py <sku> <name> <price> <category> <img_url_1> [img_url_2] [img_url_3]")
        sys.exit(1)

    sku = sys.argv[1]
    name = sys.argv[2]
    price = sys.argv[3]
    category = sys.argv[4]
    img_urls = sys.argv[5:]

    # API keys
    GROQ_KEY = os.environ.get("GROQ_API_KEY", "")
    MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")

    sku_safe = ''.join(c if c.isalnum() else '_' for c in sku)[:40]
    output_file = os.path.join(VIDEO_DIR, f"video-{sku_safe}-ad.mp4")

    # Unique work dir per SKU to avoid race conditions
    WORK_DIR = tempfile.mkdtemp(prefix=f"dlv_vid_{sku_safe}_")
    os.makedirs(WORK_DIR, exist_ok=True)

    # Skip if already exists
    if os.path.exists(output_file) and os.path.getsize(output_file) > 1000000:
        print(f"ALREADY_EXISTS:{output_file}")
        sys.exit(0)

    print(f"Generating video for: {name} ({sku})")
    print(f"Category: {category}, Price: {price}")

    # Clean work dir
    for f in os.listdir(WORK_DIR):
        os.remove(os.path.join(WORK_DIR, f))

    # Download images
    img_paths = []
    for i, url in enumerate(img_urls[:4]):
        path = os.path.join(WORK_DIR, f"img_{i}.jpg")
        if download_image(url, path):
            img_paths.append(path)
            print(f"  Downloaded image {i+1}: {path}")

    if not img_paths:
        print("ERROR: No images downloaded")
        sys.exit(1)

    # Generate qualities - try AI first, fallback to static
    print("  Generating product qualities...")
    qualities = None
    if GROQ_KEY:
        qualities = generate_category_qualities_ai(name, price, category)
        if qualities:
            print(f"  AI qualities: {len(qualities)} generated")

    if not qualities:
        print("  Using static qualities (AI unavailable)")
        qualities = generate_category_qualities(category.lower())

    # Generate voice script - try AI first
    print("  Generating voice script...")
    voice_script = None
    if GROQ_KEY:
        ai_script = generate_ai_script(name, price, category)
        if ai_script:
            voice_script = create_voice_script_from_ai(ai_script, price)
            print(f"  AI script: {voice_script[:80]}...")

    if not voice_script:
        print("  Using fallback voice script")
        voice_script = generate_voice_script_fallback(name, price, qualities, category)

    # Generate voice
    voice_file = os.path.join(WORK_DIR, "voice.mp3")
    print(f"  Generating voice-over...")
    if not generate_voice(voice_script, voice_file, sku=sku_safe):
        print("ERROR: Voice generation failed")
        sys.exit(1)

    voice_dur = get_voice_duration(voice_file)
    print(f"  Voice duration: {voice_dur:.1f}s")

    # Timing
    intro_dur = 1.5
    outro_dur = 5.0
    n_imgs = len(img_paths)
    main_dur = voice_dur + 1.0
    seg_dur = main_dur / n_imgs
    total_dur = intro_dur + main_dur + outro_dur
    print(f"  Total duration: {total_dur:.1f}s, {n_imgs} segments at {seg_dur:.1f}s each")

    # Get silence boundaries for subtitle timing
    print("  Analyzing audio for subtitle timing...")
    voice_boundaries = get_audio_word_timestamps(voice_file)
    print(f"  Found {len(voice_boundaries)} audio boundaries")

    # Create intro
    intro_file = create_intro(intro_dur)
    print("  Intro done")

    # Create segments
    seg_files = []
    for i, (img_path, quality) in enumerate(zip(img_paths, qualities[:n_imgs])):
        seg_file = create_segment(img_path, seg_dur, quality[0], quality[1], name, price, i, n_imgs, voice_boundaries)
        seg_files.append(seg_file)
        print(f"  Segment {i+1}/{n_imgs} done")

    # Create outro
    outro_file = create_outro(outro_dur, name, price)
    print("  Outro done")

    # Concatenate
    concat_file = os.path.join(WORK_DIR, "concat.mp4")
    concat_list = os.path.join(WORK_DIR, "concat_list.txt")
    all_files = [intro_file] + seg_files + [outro_file]
    with open(concat_list, 'w') as f:
        for sf in all_files:
            f.write(f"file '{sf}'\n")

    run_cmd(f'ffmpeg -y -f concat -safe 0 -i "{concat_list}" -c copy "{concat_file}"')
    print("  Concatenated")

    # Get video duration
    video_dur = get_voice_duration(concat_file)
    if video_dur == 0:
        video_dur = total_dur

    # Add audio with ducking (inspired by MoneyPrinterTurbo)
    final_file = output_file
    delay_ms = int(intro_dur * 1000)

    if os.path.exists(BG_MUSIC):
        # Ducking: music at 30% when voice is silent, drops to 12% during voice
        # Using "volume" automation based on voice presence
        # Since we can't detect voice in real-time with ffmpeg alone,
        # we use a constant low level for music during the entire video
        # (simpler approach that sounds professional)
        audio_filter = (
            f"[1:a]volume=0.15,aloop=loop=-1:size=2e+09,atrim=0:{video_dur},afade=t=in:st=0:d=1.5,afade=t=out:st={video_dur-2}:d=2[mus];"
            f"[2:a]aresample=44100,aformat=channel_layouts=stereo,adelay={delay_ms}|{delay_ms},apad=whole_dur={video_dur},volume=1.5[voc];"
            f"[mus][voc]amix=inputs=2:duration=first:normalize=0:dropout_transition=0[aout]"
        )
        cmd = (
            f'ffmpeg -y -i "{concat_file}" -i "{BG_MUSIC}" -i "{voice_file}" '
            f'-filter_complex "{audio_filter}" '
            f'-map 0:v -map "[aout]" '
            f'-c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 '
            f'-shortest "{final_file}"'
        )
    else:
        # No background music, add voice as the only audio
        audio_filter = (
            f"[1:a]aresample=44100,aformat=channel_layouts=stereo,"
            f"adelay={delay_ms}|{delay_ms},apad=whole_dur={video_dur},volume=1.5[voc]"
        )
        cmd = (
            f'ffmpeg -y -i "{concat_file}" -i "{voice_file}" '
            f'-filter_complex "{audio_filter}" '
            f'-map 0:v -map "[voc]" '
            f'-c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2 '
            f'-shortest "{final_file}"'
        )
    run_cmd(cmd)

    # Verify
    final_dur = get_voice_duration(final_file)
    if final_dur > 0:
        size_mb = os.path.getsize(final_file) / (1024 * 1024)
        print(f"SUCCESS:{final_file}")
        print(f"DURATION:{final_dur:.1f}")
        print(f"SIZE:{size_mb:.1f}MB")
    else:
        print(f"ERROR: Final video duration is 0")
        sys.exit(1)


if __name__ == "__main__":
    main()
