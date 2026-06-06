import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.ids;

    const admin = createAdminClient();
    let query = admin.from('notificaciones').update({ leida: true }).eq('destinatario_id', user.id);
    if (Array.isArray(ids) && ids.length > 0) {
      query = query.in('id', ids as string[]);
    }
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('POST /api/notificaciones/marcar-leidas error:', err);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
