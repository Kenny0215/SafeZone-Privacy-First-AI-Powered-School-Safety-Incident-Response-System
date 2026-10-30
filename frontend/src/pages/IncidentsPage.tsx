import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  FolderOpenDot,
  Search,
  Filter,
  ArrowUpDown,
  RotateCcw,
  Download,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  MapPin,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { incidentService } from '../services/incidentService.ts';
import { Incident } from '../types/index.ts';
import { filterIncidents, sortIncidents, formatSafeDate } from '../utils/incidentLogic.ts';
import { SeverityBadge } from '../components/common/SeverityBadge.tsx';
import { StatusBadge } from '../components/common/StatusBadge.tsx';

const ITEMS_PER_PAGE = 7;

export const IncidentsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<Incident[]>(() => incidentService.getIncidents());

  // Filters state initialized from query params if available
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [severity, setSeverity] = useState(searchParams.get('severity') || 'all');
  const [status, setStatus] = useState(searchParams.get('status') || 'all');
  const [source, setSource] = useState('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'priority-desc' | 'priority-asc'>('date-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = incidentService.subscribe(() => {
      setIncidents(incidentService.getIncidents());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update query params when search changes
  useEffect(() => {
    const query = searchParams.get('search');
    if (query && query !== search) {
      setSearch(query);
    }
  }, [searchParams]);

  // Compute filtered & sorted list
  const filteredList = useMemo(() => {
    const res = filterIncidents(incidents, {
      search,
      category,
      severity,
      status,
      source,
    });
    return sortIncidents(res, sortBy);
  }, [incidents, search, category, severity, status, source, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredList.length / ITEMS_PER_PAGE) || 1;
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredList.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredList, currentPage]);

  const handleResetFilters = () => {
    setSearch('');
    setCategory('all');
    setSeverity('all');
    setStatus('all');
    setSource('all');
    setSortBy('date-desc');
    setCurrentPage(1);
    setSearchParams({});
  };

  const hasActiveFilters =
    search !== '' || category !== 'all' || severity !== 'all' || status !== 'all' || source !== 'all';

  const csvEscape = (value: unknown): string => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleExportCSV = () => {
    const headers = [
      'Case ID',
      'Category',
      'Title',
      'Location',
      'Privacy Level',
      'Source',
      'Severity',
      'Assigned Staff',
      'Status',
      'Reported At',
    ];
    const rows = filteredList.map((incident) => [
      incident.id,
      incident.category,
      incident.title,
      incident.location,
      incident.privacyLevel,
      incident.source,
      incident.severity,
      incident.assignedStaff ? incident.assignedStaff.name : 'Unassigned',
      incident.status,
      formatSafeDate(incident.reportedAt),
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `safezone-incidents-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredList
      .map(
        (incident) => `
        <tr>
          <td>${incident.id}</td>
          <td>${incident.category}<br/><span class="sub">${incident.title}</span></td>
          <td>${incident.location}</td>
          <td>${incident.source}</td>
          <td>${incident.severity}</td>
          <td>${incident.assignedStaff ? incident.assignedStaff.name : 'Unassigned'}</td>
          <td>${incident.status}</td>
          <td>${formatSafeDate(incident.reportedAt)}</td>
        </tr>`
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>SafeZone Incident Report</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; padding: 24px; }
            h1 { font-size: 18px; margin-bottom: 2px; }
            p.meta { font-size: 11px; color: #64748b; margin-top: 0; margin-bottom: 18px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
            th { background: #f1f5f9; text-transform: uppercase; font-size: 9px; color: #475569; }
            .sub { font-size: 10px; color: #64748b; }
          </style>
        </head>
        <body>
          <h1>SafeZone Incident Report</h1>
          <p class="meta">Generated ${new Date().toLocaleString()} • ${filteredList.length} incident${filteredList.length !== 1 ? 's' : ''}</p>
          <table>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Category & Summary</th>
                <th>Location</th>
                <th>Source</th>
                <th>Severity</th>
                <th>Assigned Staff</th>
                <th>Status</th>
                <th>Reported Time</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
    setShowExportMenu(false);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FolderOpenDot size={18} className="text-cyan-600" />
            <span>School Incident Case Register</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-tracked queue of student reports, optical CCTV alerts, and environmental sensors
          </p>
        </div>

        <div className="relative flex items-center gap-2 self-start sm:self-auto" ref={exportRef}>
          <button
            type="button"
            onClick={() => setShowExportMenu((v) => !v)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 text-white font-semibold text-xs hover:bg-cyan-700 transition-colors shadow-xs"
          >
            <Download size={14} />
            <span>Download Report</span>
            <ChevronDown size={13} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
          </button>

          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden z-20">
              <button
                type="button"
                onClick={handleExportPDF}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <FileText size={14} className="text-rose-500" />
                <span>Export to PDF</span>
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
              >
                <FileSpreadsheet size={14} className="text-emerald-600" />
                <span>Export to CSV</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          {/* Search box */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              placeholder="Search ID, title, or keywords..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 text-slate-900"
            />
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          </div>

          {/* Category */}
          <div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All Categories</option>
              <option value="Bullying">Bullying</option>
              <option value="Physical Fighting">Physical Fighting</option>
              <option value="Harassment">Harassment</option>
              <option value="Student Distress">Student Distress</option>
              <option value="Unsafe Location">Unsafe Location</option>
              <option value="Other Safety Concern">Other Safety Concern</option>
            </select>
          </div>

          {/* Severity */}
          <div>
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All Priorities</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All Statuses</option>
              <option value="New">New</option>
              <option value="Under Review">Under Review</option>
              <option value="Assigned">Assigned</option>
              <option value="Responding">Responding</option>
              <option value="Under Investigation">Under Investigation</option>
              <option value="Resolved">Resolved</option>
              <option value="Dismissed">Dismissed</option>
            </select>
          </div>

          {/* Source */}
          <div>
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All Sources</option>
              <option value="Student Report (Anon)">Student (Anon)</option>
              <option value="Student Report (Confidential)">Student (Confidential)</option>
              <option value="CCTV AI Detection (Permitted Zone)">CCTV AI Detection</option>
              <option value="Staff Report">Staff Report</option>
              <option value="Help Point Button">Help Point Button</option>
              <option value="Non-Visual Sensor">Non-Visual Sensor</option>
            </select>
          </div>
        </div>

        {/* Second filter row: Sorting & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 flex items-center gap-1">
              <ArrowUpDown size={13} />
              <span>Sort by:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2 py-1 text-xs rounded border border-slate-200 bg-slate-50 text-slate-700 font-medium"
            >
              <option value="date-desc">Newest First</option>
              <option value="date-asc">Oldest First</option>
              <option value="priority-desc">Highest Priority First</option>
              <option value="priority-asc">Lowest Priority First</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-500 font-medium">
              Showing {filteredList.length} incident{filteredList.length !== 1 ? 's' : ''}
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-semibold"
              >
                <RotateCcw size={12} />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Case ID</th>
                <th className="px-4 py-3">Category & Summary</th>
                <th className="px-4 py-3">Location & Zone</th>
                <th className="px-4 py-3">Reporting Source</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Assigned Staff</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Reported Time</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-600 mb-1">No incidents found</p>
                    <p className="text-xs">Try clearing filters or search query.</p>
                  </td>
                </tr>
              ) : (
                paginatedList.map((incident) => (
                  <tr
                    key={incident.id}
                    onClick={() => navigate(`/incidents/${incident.id}`)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5 font-bold text-slate-900 whitespace-nowrap">
                      {incident.id}
                    </td>
                    <td className="px-4 py-3.5 text-slate-800 max-w-xs">
                      <div className="font-semibold text-slate-900">{incident.category}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{incident.title}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <MapPin size={13} className="text-slate-400" />
                        <span className="font-medium">{incident.location}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block ml-4">
                        {incident.privacyLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap text-[11px]">
                      {incident.source}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <SeverityBadge severity={incident.severity} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-[11px]">
                      {incident.assignedStaff ? (
                        <div className="font-medium text-slate-800">
                          {incident.assignedStaff.name}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <StatusBadge status={incident.status} size="sm" />
                    </td>
                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                      {formatSafeDate(incident.reportedAt)}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/incidents/${incident.id}`);
                        }}
                        className="text-cyan-700 hover:text-cyan-900 font-semibold inline-flex items-center gap-1"
                      >
                        <span>Manage</span>
                        <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-medium"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentPage(i + 1)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold ${
                    currentPage === i + 1
                      ? 'bg-cyan-600 text-white'
                      : 'hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 font-medium"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};