// =============================================================================
// Google Ads AI Optimizer — IA para optimizar campañas de Google Ads
// -----------------------------------------------------------------------------
// Analiza métricas de campañas y genera recomendaciones de optimización.
// =============================================================================

export async function generateOptimizationRecommendations(db, campaignsData) {
  if (!campaignsData?.results || campaignsData.results.length === 0) {
    return { recommendations: [], summary: 'No hay datos de campañas para analizar.' };
  }

  const campaignRows = campaignsData.results;
  const analysis = {
    totalClicks: 0,
    totalImpressions: 0,
    totalCostMicros: 0,
    totalConversions: 0,
    avgCtr: 0,
    avgCpc: 0,
    underperforming: [],
    highPerforming: [],
  };

  for (const row of campaignRows) {
    const clicks = Number(row.metrics?.clicks) || 0;
    const impressions = Number(row.metrics?.impressions) || 0;
    const costMicros = Number(row.metrics?.costMicros) || 0;
    const ctr = Number(row.metrics?.ctr) || 0;
    const cpc = Number(row.metrics?.averageCpc) || 0;
    const conversions = Number(row.metrics?.conversions) || 0;

    analysis.totalClicks += clicks;
    analysis.totalImpressions += impressions;
    analysis.totalCostMicros += costMicros;
    analysis.totalConversions += conversions;
    analysis.avgCtr += ctr;
    analysis.avgCpc += cpc;

    const costUsd = costMicros / 1_000_000;
    const name = row.campaign?.name || 'Sin nombre';

    if (impressions > 0 && ctr < 0.02) {
      analysis.underperforming.push({
        name,
        ctr: (ctr * 100).toFixed(2) + '%',
        clicks,
        impressions,
        costUsd: costUsd.toFixed(2),
        issue: 'CTR muy bajo (menos del 2%)',
      });
    }
    if (cpc > 3000000) { // > 3 USD
      analysis.underperforming.push({
        name,
        cpc: (cpc / 1000000).toFixed(2) + ' USD',
        issue: 'CPC demasiado alto',
      });
    }
    if (impressions > 1000 && ctr > 0.05) {
      analysis.highPerforming.push({
        name,
        ctr: (ctr * 100).toFixed(2) + '%',
        clicks,
        conversions,
        costUsd: costUsd.toFixed(2),
      });
    }
  }

  const count = campaignRows.length;
  analysis.avgCtr = count > 0 ? analysis.avgCtr / count : 0;
  analysis.avgCpc = count > 0 ? analysis.avgCpc / count : 0;
  analysis.totalCostUsd = (analysis.totalCostMicros / 1_000_000).toFixed(2);

  // Generar recomendaciones
  const recommendations = [];

  if (analysis.underperforming.length > 0) {
    for (const u of analysis.underperforming) {
      if (u.issue.includes('CTR')) {
        recommendations.push({
          type: 'warning',
          campaign: u.name,
          title: 'CTR bajo — mejorar titulares',
          detail: `La campaña "${u.name}" tiene CTR del ${u.ctr} con ${u.impressions} impresiones. Esto indica que los titulares no están captando la atención.`,
          suggestion: 'Usa titulares más específicos con el nombre del producto, precio o beneficio principal. Incluye palabras clave de intención de compra.',
          actions: ['Revisar titulares', 'Agregar palabras clave negativas', 'Probar nuevos anuncios'],
        });
      } else if (u.issue.includes('CPC')) {
        recommendations.push({
          type: 'warning',
          campaign: u.name,
          title: 'CPC alto — optimizar puja',
          detail: `La campaña "${u.name}" tiene un CPC de ${u.cpc}.`,
          suggestion: 'Reduce la puja máxima o cambia a estrategia de puja automática (Maximize Clicks) con un límite de CPA.',
          actions: ['Reducir puja máxima', 'Cambiar a puja automática'],
        });
      }
    }
  }

  if (analysis.highPerforming.length > 0) {
    for (const h of analysis.highPerforming) {
      recommendations.push({
        type: 'success',
        campaign: h.name,
        title: 'Rendimiento alto — escalar presupuesto',
        detail: `La campaña "${h.name}" tiene CTR del ${h.ctr} con ${h.clicks} clics.`,
        suggestion: 'Considera aumentar el presupuesto diario un 20% para capturar más tráfico de calidad.',
        actions: ['Aumentar presupuesto 20%', 'Duplicar campañas exitosas'],
      });
    }
  }

  if (analysis.totalImpressions > 0 && analysis.avgCtr < 0.03) {
    recommendations.push({
      type: 'info',
      campaign: 'General',
      title: 'CTR promedio bajo en todas las campañas',
      detail: `El CTR promedio es del ${(analysis.avgCtr * 100).toFixed(2)}% across ${count} campañas.`,
      suggestion: 'Revisa que las palabras clave sean relevantes y que los titulares incluyan los términos de búsqueda del usuario.',
      actions: ['Auditoría de keywords', 'Mejorar calidad de anuncios'],
    });
  }

  if (analysis.totalConversions === 0 && analysis.totalClicks > 50) {
    recommendations.push({
      type: 'warning',
      campaign: 'General',
      title: 'Sin conversiones registradas',
      detail: `Has tenido ${analysis.totalClicks} clics pero 0 conversiones.`,
      suggestion: 'Verifica que el seguimiento de conversiones esté configurado correctamente. Revisa la landing page para asegurar que el formulario de contacto o botón de compra es visible.',
      actions: ['Verificar tag de conversión', 'Optimizar landing page'],
    });
  }

  recommendations.push({
    type: 'info',
    campaign: 'General',
    title: 'Resumen de métricas',
    detail: `${count} campañas · ${analysis.totalImpressions} impresiones · ${analysis.totalClicks} clics · $${analysis.totalCostUsd} gasto · ${(analysis.avgCtr * 100).toFixed(2)}% CTR promedio · $${(analysis.avgCpc / 1000000).toFixed(2)} CPC promedio`,
    suggestion: 'Datos del período seleccionado.',
    actions: [],
  });

  return {
    recommendations,
    summary: `Analizadas ${count} campañas: ${analysis.totalClicks} clics, ${(analysis.avgCtr * 100).toFixed(2)}% CTR promedio, $${analysis.totalCostUsd} invertidos.`,
    stats: {
      campaigns: count,
      totalClicks: analysis.totalClicks,
      totalImpressions: analysis.totalImpressions,
      totalCostUsd: analysis.totalCostUsd,
      avgCtr: (analysis.avgCtr * 100).toFixed(2) + '%',
      avgCpc: '$' + (analysis.avgCpc / 1000000).toFixed(2),
      totalConversions: analysis.totalConversions,
    },
  };
}
