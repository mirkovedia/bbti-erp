'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from '@tanstack/react-table';
import { Plus, Search, ArrowUpDown, Trash2 } from 'lucide-react';
import { Proyecto, EstadoProyecto } from '@/types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { useAppStore } from '@/store/appStore';
import { useDebounce } from '@/hooks/useDebounce';
import { can } from '@/lib/auth/permissions';
import { fm } from '@/lib/utils/format';
import { ProyectoModal } from '@/components/proyectos/ProyectoModal';
import { cn } from '@/lib/utils';

const columnHelper = createColumnHelper<Proyecto>();

export default function ProyectosPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showModal, setShowModal] = useState(false);

  const fetchProyectos = async () => {
    try {
      const res = await fetch('/api/proyectos');
      const data = await res.json();
      setProyectos(data);
    } catch (err) {
      console.error('Error fetching proyectos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProyectos();
  }, []);

  const puedeEliminar = can(user, 'canDelete');

  const handleDelete = async (id: string, cliente: string) => {
    if (!confirm(`¿Estás seguro que deseas eliminar la PR ${id} (${cliente})?\nEsta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/proyectos/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProyectos((prev) => prev.filter((p) => p.id !== id));
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'No se pudo eliminar el proyecto');
      }
    } catch {
      alert('Error de conexión al eliminar.');
    }
  };

  const columns = useMemo(() => [
    columnHelper.accessor('id', {
      header: 'ID',
      cell: (info) => (
        <span className="text-blue-400 font-mono text-sm">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor('cliente', {
      header: 'Cliente',
      cell: (info) => <span className="text-white font-medium">{info.getValue()}</span>,
    }),
    columnHelper.accessor('estado', {
      header: 'Estado',
      cell: (info) => <StatusBadge estado={info.getValue()} />,
    }),
    columnHelper.accessor('monto', {
      header: 'Monto',
      cell: (info) => (
        <span className="text-slate-300">{fm(info.getValue())}</span>
      ),
    }),
    columnHelper.accessor('fecha_creacion', {
      header: 'Fecha',
      cell: (info) => <span className="text-slate-400 text-sm">{info.getValue()}</span>,
    }),
    columnHelper.accessor('usuario_nombre', {
      header: 'Responsable',
      cell: (info) => <span className="text-slate-300">{info.getValue()}</span>,
    }),
    columnHelper.display({
      id: 'progreso',
      header: 'Progreso',
      cell: (info) => {
        const p = info.row.original;
        const prog = p.produccion?.progreso || 0;
        return <ProgressBar value={prog} className="w-24" />;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const debouncedSearch = useDebounce(search);
  const filteredData = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return proyectos.filter((p) => {
      const matchesSearch = p.cliente.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      const matchesEstado = !estadoFilter || p.estado === estadoFilter;
      return matchesSearch && matchesEstado;
    });
  }, [proyectos, debouncedSearch, estadoFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const estados: EstadoProyecto[] = [
    'EN PRODUCCIÓN',
    'LISTO PARA PRUEBAS',
    'EN INGENIERÍA',
    'COMPRAS EN CURSO',
    'RETRASADO',
    'COMPLETADO',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Proyectos</h1>
          <p className="text-slate-400 mt-1">{proyectos.length} órdenes registradas</p>
        </div>
        {can(user, 'canCreate') && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-medium rounded-lg transition-all shadow-lg shadow-blue-500/20 shrink-0"
          >
            <Plus className="w-4 h-4" />
            Nueva Orden
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente o ID..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <select
          value={estadoFilter}
          onChange={(e) => setEstadoFilter(e.target.value)}
          className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          {estados.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: proyectos.length, color: 'text-blue-400' },
          { label: 'En Produccion', value: proyectos.filter(p => p.estado === 'EN PRODUCCIÓN').length, color: 'text-cyan-400' },
          { label: 'Retrasados', value: proyectos.filter(p => p.estado === 'RETRASADO').length, color: 'text-red-400' },
          { label: 'Completados', value: proyectos.filter(p => p.estado === 'COMPLETADO').length, color: 'text-green-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-[var(--navy2)] rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className={cn('text-3xl font-bold mt-1', stat.color)}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-[var(--navy2)] rounded-xl border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 mt-2">Cargando proyectos...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-400">No se encontraron proyectos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-slate-700">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase cursor-pointer hover:text-white transition-colors"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                    ))}
                    {puedeEliminar && (
                      <th className="text-center py-3 px-4 text-xs font-medium text-slate-400 uppercase">Acc.</th>
                    )}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => router.push(`/proyectos/${row.original.id}`)}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-3 px-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {puedeEliminar && (
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleDelete(row.original.id, row.original.cliente)}
                          title="Eliminar proyecto"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <ProyectoModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchProyectos();
          }}
        />
      )}
    </div>
  );
}
