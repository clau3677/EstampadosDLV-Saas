'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  User, LogOut, Home, Package, ShoppingBag, ExternalLink, Shield,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth, apiLogout } from '@/hooks/use-auth';

export function UserMenu() {
  const { user, isAdmin, isOperator, isCustomer } = useAuth();
  const router = useRouter();

  const logout = async () => {
    await apiLogout();
    toast.success('Sesión cerrada');
    // Full reload so middleware picks up the cleared cookie
    window.location.href = '/login';
  };

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="text-slate-600">
          <Link href="/login">Ingresar</Link>
        </Button>
        <Button asChild size="sm" className="bg-orange-500 hover:bg-orange-600">
          <Link href="/registro">Crear cuenta</Link>
        </Button>
      </div>
    );
  }

  const initial = (user.fullName || user.email || '?').charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-slate-100 transition-colors" aria-label={`Menú de usuario de ${user.fullName || user.email}`}>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white flex items-center justify-center text-sm font-bold shadow-sm">
            {initial}
          </div>
          <div className="hidden md:block text-left leading-tight">
            <div className="text-xs font-semibold text-slate-800 max-w-[140px] truncate">{user.fullName || user.email}</div>
            <div className="text-[10px] text-slate-500 uppercase">{user.role}</div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-xs text-slate-500">Sesión iniciada como</div>
          <div className="text-sm font-semibold text-slate-900 truncate">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {(isAdmin || isOperator) && (
          <>
            <DropdownMenuItem asChild>
              <Link href="/admin" className="cursor-pointer"><Shield className="h-4 w-4 mr-2" />Panel de administración</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/tienda" className="cursor-pointer"><ShoppingBag className="h-4 w-4 mr-2" />Ver sitio público <ExternalLink className="h-3 w-3 ml-auto opacity-50" /></Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuItem asChild>
          <Link href="/mi-cuenta" className="cursor-pointer"><User className="h-4 w-4 mr-2" />Mi cuenta</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/mi-cuenta/pedidos" className="cursor-pointer"><Package className="h-4 w-4 mr-2" />Mis pedidos</Link>
        </DropdownMenuItem>
        {isCustomer && (
          <DropdownMenuItem asChild>
            <Link href="/tienda" className="cursor-pointer"><Home className="h-4 w-4 mr-2" />Ir a la tienda</Link>
          </DropdownMenuItem>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-700 focus:bg-rose-50 cursor-pointer">
          <LogOut className="h-4 w-4 mr-2" />Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserMenu;
