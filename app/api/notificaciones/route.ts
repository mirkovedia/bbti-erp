import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    // La RLS ya acota a las del usuario; filtramos explícito por claridad.
    const { data: items } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('destinatario_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const { count } = await supabase
      .from('notificaciones')
      .select('*', { count: 'exact', head: true })
      .eq('destinatario_id', user.id)
      .eq('leida', false);

    return NextResponse.json({ items: items ?? [], unreadCount: count ?? 0 });
  } catch (err) {
    console.error('GET /api/notificaciones error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
