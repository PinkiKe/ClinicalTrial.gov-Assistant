import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  AlertTriangle, 
  Table, 
  Info,
  Calendar,
  MapPin,
  Beaker,
  Search,
  X,
  Stethoscope,
  Download
} from 'lucide-react';
import { Trial } from '../types';

interface AdverseEventsCacheProps {
  cachedTrials: Trial[];
  onRemoveTrials: (nctIds: string[]) => void;
  onClearAll: () => void;
  lang: 'zh' | 'en';
}

export default function AdverseEventsCache({
  cachedTrials,
  onRemoveTrials,
  onClearAll,
  lang
}: AdverseEventsCacheProps) {
  const [expandedTrials, setExpandedTrials] = useState<Record<string, boolean>>({});
  const [expandedSeriousTrials, setExpandedSeriousTrials] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const TEXTS = {
    zh: {
      title: "其他不良事件暫存資料庫",
      subtitle: "收集並儲存各臨床試驗的詳細其他不良事件數據",
      totalCount: "共儲存 {count} 項試驗",
      selectAll: "全選",
      deselectAll: "取消全選",
      deleteSelected: "刪除選取試驗 ({count})",
      exportCsv: "匯出選取試驗 (CSV)",
      clearCache: "清空所有暫存",
      emptyState: "暫存箱目前沒有任何數據",
      emptyStateDesc: "請返回對話諮詢頁面搜尋試驗，並在展開的不良事件下方點擊「導入數據」按鈕。",
      backToChat: "前往對話與搜尋",
      trialHeader: "試驗基本資訊",
      nctIdLabel: "試驗編號 (NCT ID)",
      conditionLabel: "疾病狀況 (Conditions)",
      interventionLabel: "介入治療方式 (Interventions)",
      summaryLabel: "試驗簡單摘要 (Summary)",
      hideTable: "收合其他不良事件詳細表格",
      showTable: "展開其他不良事件詳細表格 ({count} 項事件)",
      hideSeriousTable: "收合嚴重不良事件詳細表格",
      showSeriousTable: "展開嚴重不良事件詳細表格 ({count} 項事件)",
      columnEvent: "不良事件名稱",
      columnGroup: "組別/試驗組名稱",
      columnAtRisk: "組別總人數",
      columnAffected: "發生事件人數",
      columnCount: "發生事件數量",
      columnRate: "發生比例 (%)",
      rateFormula: "發生率",
      noGroupStats: "該試驗報告了不良事件，但公開資料中未包含分組統計細節。",
      overallLabel: "整體/不分組",
      resetTitle: "確認重置暫存資料",
      resetWarning: "您確定要清除所有暫存的臨床試驗數據嗎？此操作將無法復原。",
      confirmReset: "確認清除",
      cancel: "取消",
      itemsRemoved: "已成功刪除選取的試驗。",
      cacheCleared: "已清空所有暫存試驗。"
    },
    en: {
      title: "Other Adverse Events Cache",
      subtitle: "Collect and cache detailed other adverse events across selected clinical trials",
      totalCount: "{count} trials stored",
      selectAll: "Select All",
      deselectAll: "Deselect All",
      deleteSelected: "Delete Selected ({count})",
      exportCsv: "Export Selected (CSV)",
      clearCache: "Clear Cache",
      emptyState: "Adverse Events Cache is empty",
      emptyStateDesc: "Go back to the chat room, expand adverse events for a trial, and click 'Import Data'.",
      backToChat: "Back to Chat",
      trialHeader: "Trial Core Metadata",
      nctIdLabel: "Trial ID",
      conditionLabel: "Conditions",
      interventionLabel: "Interventions",
      summaryLabel: "Brief Summary",
      hideTable: "Collapse Other Adverse Events",
      showTable: "Expand Other Adverse Events ({count} events)",
      hideSeriousTable: "Collapse Serious Adverse Events",
      showSeriousTable: "Expand Serious Adverse Events ({count} events)",
      columnEvent: "Adverse Event Name",
      columnGroup: "Trial Group / Arm Name",
      columnAtRisk: "Group Total (N)",
      columnAffected: "Subjects Affected",
      columnCount: "Number of Events",
      columnRate: "Proportion (%)",
      rateFormula: "Incidence Rate",
      noGroupStats: "This trial reported adverse events, but group-by-group breakdowns are not public.",
      overallLabel: "Overall/Combined",
      resetTitle: "Confirm Clear Cache",
      resetWarning: "Are you sure you want to clear all stored trial adverse events? This action cannot be undone.",
      confirmReset: "Clear All",
      cancel: "Cancel",
      itemsRemoved: "Selected trials deleted successfully.",
      cacheCleared: "All cached trials cleared."
    }
  };

  const t = TEXTS[lang];

  const handleToggleExpand = (nctId: string) => {
    setExpandedTrials(prev => ({
      ...prev,
      [nctId]: !prev[nctId]
    }));
  };

  const handleToggleExpandSerious = (nctId: string) => {
    setExpandedSeriousTrials(prev => ({
      ...prev,
      [nctId]: !prev[nctId]
    }));
  };

  const handleSelectToggle = (nctId: string) => {
    const next = new Set(selectedIds);
    if (next.has(nctId)) {
      next.delete(nctId);
    } else {
      next.add(nctId);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === cachedTrials.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(cachedTrials.map(t => t.nctId)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    onRemoveTrials(Array.from(selectedIds));
    setSelectedIds(new Set());
  };

  const handleTriggerClearAll = () => {
    setShowConfirmReset(true);
  };

  const handleConfirmClearAll = () => {
    onClearAll();
    setSelectedIds(new Set());
    setShowConfirmReset(false);
  };

  const handleExportCSV = () => {
    const trialsToExport = cachedTrials.filter(t => selectedIds.has(t.nctId));
    if (trialsToExport.length === 0) return;

    // CSV Headers strictly as requested
    const headers = [
      "NCT ID",
      lang === 'en' ? "Title" : "試驗名稱",
      lang === 'en' ? "Condition" : "疾病狀況",
      lang === 'en' ? "Intervention" : "介入治療方式",
      lang === 'en' ? "Adverse Event Classification" : "不良事件分類",
      lang === 'en' ? "Adverse Event Term" : "不良事件項目",
      lang === 'en' ? "Group Name" : "組別名稱",
      lang === 'en' ? "Group Participants (N)" : "組別人數",
      lang === 'en' ? "Group Affected Count" : "組別發生不良事件人數",
      lang === 'en' ? "Group Affected Rate (%)" : "組別發生人數比例",
      lang === 'en' ? "Group Event Count" : "組別發生不良事件次數"
    ];

    const rows: string[][] = [];

    trialsToExport.forEach(trial => {
      const conditionStr = trial.conditions.join("; ");
      const interventionStr = (trial.interventions || []).map(i => `[${i.type}] ${i.name}`).join("; ");
      
      const hasSerious = trial.seriousEvents && trial.seriousEvents.length > 0;
      const hasOther = trial.otherEvents && trial.otherEvents.length > 0;

      if (!hasSerious && !hasOther) {
        // Fallback row if no events recorded
        rows.push([
          trial.nctId,
          trial.briefTitle,
          conditionStr,
          interventionStr,
          "N/A",
          lang === 'en' ? "No Adverse Events Registered" : "未登錄任何不良事件數據",
          "N/A",
          "N/A",
          "N/A",
          "N/A",
          "N/A"
        ]);
        return;
      }

      // Handle serious events
      if (hasSerious) {
        trial.seriousEvents!.forEach(e => {
          const classification = lang === 'en' 
            ? `Serious Adverse Event (${e.organSystem})` 
            : `嚴重不良事件 (${e.organSystem})`;
          const term = e.term;

          const hasStats = e.stats && e.stats.length > 0;
          if (hasStats) {
            e.stats!.forEach(s => {
              const groupInfo = trial.eventGroups?.find(g => g.id === s.groupId);
              const groupName = groupInfo?.title || s.groupId;
              const atRisk = s.numAtRisk !== undefined ? s.numAtRisk.toString() : "-";
              const affected = s.numAffected !== undefined ? s.numAffected.toString() : "-";
              const events = s.numEvents !== undefined ? s.numEvents.toString() : "-";
              const pct = s.numAtRisk && s.numAtRisk > 0 && s.numAffected !== undefined 
                ? ((s.numAffected / s.numAtRisk) * 100).toFixed(2) + '%' 
                : "-";

              rows.push([
                trial.nctId,
                trial.briefTitle,
                conditionStr,
                interventionStr,
                classification,
                term,
                groupName,
                atRisk,
                affected,
                pct,
                events
              ]);
            });
          } else {
            // Fallback or overall
            const atRisk = "-";
            const affected = e.numAffected !== undefined ? e.numAffected.toString() : "-";
            const events = e.numEvents !== undefined ? e.numEvents.toString() : "-";
            const pct = "-";
            const groupName = lang === 'en' ? "Overall/Combined" : "整體/不分組";

            rows.push([
              trial.nctId,
              trial.briefTitle,
              conditionStr,
              interventionStr,
              classification,
              term,
              groupName,
              atRisk,
              affected,
              pct,
              events
            ]);
          }
        });
      }

      // Handle other events
      if (hasOther) {
        trial.otherEvents!.forEach(e => {
          const classification = lang === 'en' 
            ? `Other Adverse Event (${e.organSystem})` 
            : `其他不良事件 (${e.organSystem})`;
          const term = e.term;

          const hasStats = e.stats && e.stats.length > 0;
          if (hasStats) {
            e.stats!.forEach(s => {
              const groupInfo = trial.eventGroups?.find(g => g.id === s.groupId);
              const groupName = groupInfo?.title || s.groupId;
              const atRisk = s.numAtRisk !== undefined ? s.numAtRisk.toString() : "-";
              const affected = s.numAffected !== undefined ? s.numAffected.toString() : "-";
              const events = s.numEvents !== undefined ? s.numEvents.toString() : "-";
              const pct = s.numAtRisk && s.numAtRisk > 0 && s.numAffected !== undefined 
                ? ((s.numAffected / s.numAtRisk) * 100).toFixed(2) + '%' 
                : "-";

              rows.push([
                trial.nctId,
                trial.briefTitle,
                conditionStr,
                interventionStr,
                classification,
                term,
                groupName,
                atRisk,
                affected,
                pct,
                events
              ]);
            });
          } else {
            // Fallback or overall
            const atRisk = "-";
            const affected = e.numAffected !== undefined ? e.numAffected.toString() : "-";
            const events = e.numEvents !== undefined ? e.numEvents.toString() : "-";
            const pct = "-";
            const groupName = lang === 'en' ? "Overall/Combined" : "整體/不分組";

            rows.push([
              trial.nctId,
              trial.briefTitle,
              conditionStr,
              interventionStr,
              classification,
              term,
              groupName,
              atRisk,
              affected,
              pct,
              events
            ]);
          }
        });
      }
    });

    const escapeCsv = (str: string) => {
      if (!str) return '""';
      const clean = str.replace(/"/g, '""');
      return `"${clean}"`;
    };

    const csvContent = [
      headers.map(escapeCsv).join(","),
      ...rows.map(row => row.map(escapeCsv).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `clinical_trials_adverse_events_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`flex-grow w-full bg-slate-50 font-sans relative ${cachedTrials.length === 0 ? 'flex flex-col items-center justify-center py-16' : 'py-8'}`}>
      <div className="max-w-5xl mx-auto px-4 md:px-8 space-y-6">
        
        {/* Banner Headers */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-4 gap-4">
          <div>
            <h2 className="font-bold font-sans text-slate-800 tracking-tight flex items-center gap-2.5 text-2xl">
              <div className="w-8 h-8 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-md shadow-red-100 shrink-0">
                <AlertTriangle size={14} />
              </div>
              {t.title}
            </h2>
            <p className="text-slate-500 mt-1 text-sm">{t.subtitle}</p>
          </div>
          <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm self-start flex items-center gap-1.5 font-mono text-xs text-slate-600 font-semibold h-10 shrink-0">
            <Table size={14} className="text-indigo-500" />
            {t.totalCount.replace("{count}", cachedTrials.length.toString())}
          </div>
        </div>

        {cachedTrials.length === 0 ? (
          /* Empty state view */
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-3xl text-center space-y-5 shadow-sm p-12 max-w-xl mx-auto w-full"
          >
            <div className="w-12 h-12 bg-slate-50 border border-slate-100 text-slate-300 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Info size={24} />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-base leading-tight">{t.emptyState}</h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                {t.emptyStateDesc}
              </p>
            </div>
          </motion.div>
        ) : (
          /* Stored Trials list rendering */
          <div className="space-y-6">
            
            {/* Control Bar Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer hover:text-slate-800 bg-slate-50 hover:bg-slate-100/80 px-3 py-1.5 rounded-xl border border-slate-200 transition-colors">
                  <input
                    type="checkbox"
                    checked={cachedTrials.length > 0 && selectedIds.size === cachedTrials.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  {selectedIds.size === cachedTrials.length ? t.deselectAll : t.selectAll}
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  disabled={selectedIds.size === 0}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedIds.size === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-100'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 active:scale-95 shadow-sm'
                  }`}
                >
                  <Download size={13} />
                  {t.exportCsv}
                </button>

                <button
                  onClick={handleDeleteSelected}
                  disabled={selectedIds.size === 0}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    selectedIds.size === 0
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-100'
                      : 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 active:scale-95 shadow-sm'
                  }`}
                >
                  <Trash2 size={13} />
                  {t.deleteSelected.replace("{count}", selectedIds.size.toString())}
                </button>

                <button
                  onClick={handleTriggerClearAll}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-sm"
                >
                  <Trash2 size={13} className="opacity-70 group-hover:text-red-500" />
                  {t.clearCache}
                </button>
              </div>
            </div>

            {/* List entries */}
            <div className="space-y-6">
              {cachedTrials.map((trial) => {
                const isExpanded = !!expandedTrials[trial.nctId];
                const isSeriousExpanded = !!expandedSeriousTrials[trial.nctId];
                const isSelected = selectedIds.has(trial.nctId);
                const otherEventsCount = trial.otherEvents?.length || 0;
                const seriousEventsCount = trial.seriousEvents?.length || 0;

                return (
                  <motion.div
                    key={trial.nctId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                      isSelected 
                        ? 'border-indigo-300 ring-4 ring-indigo-50' 
                        : 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-md'
                    }`}
                  >
                    
                    {/* Trial Header with Checkbox selection banner */}
                    <div className="bg-slate-50/50 border-b border-slate-100 p-4 flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectToggle(trial.nctId)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-5 w-5 cursor-pointer"
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                            {trial.nctId}
                          </span>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase rounded-md border border-indigo-100 w-fit">
                            {trial.status}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 text-[11px] font-bold"
                        >
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>

                    {/* Metadata Card Panel */}
                    <div className="p-5 md:p-6 space-y-5">
                      <div className="space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.trialHeader}</span>
                        <h3 className="font-bold text-slate-800 text-base md:text-lg leading-snug">
                          {trial.briefTitle}
                        </h3>
                        {trial.officialTitle && trial.officialTitle !== trial.briefTitle && (
                          <p className="text-xs text-slate-400 italic font-sans leading-relaxed">{trial.officialTitle}</p>
                        )}
                      </div>

                      {/* Info grid - grouped closely together */}
                      <div className="flex flex-col gap-2.5 bg-slate-50/60 p-3.5 rounded-xl border border-slate-100/80">
                        {/* Conditions */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 min-w-[100px]">{t.conditionLabel}</span>
                          <div className="flex flex-wrap gap-1">
                            {trial.conditions.map((cond, idx) => (
                              <span key={idx} className="bg-white border border-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-md shadow-2xs font-medium">
                                {cond}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Interventions */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1.5 sm:gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 min-w-[100px]">{t.interventionLabel}</span>
                          <div className="flex flex-wrap gap-1">
                            {trial.interventions && trial.interventions.length > 0 ? (
                              trial.interventions.map((intv, idx) => (
                                <span key={idx} className="bg-indigo-50/60 border border-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-md font-medium shadow-2xs">
                                  [{intv.type}] {intv.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 font-sans text-xs italic">-</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Collapsible SAE Table Area */}
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        {/* Other Adverse Events */}
                        <div>
                          <button
                            onClick={() => handleToggleExpand(trial.nctId)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border font-bold text-xs transition-colors ${
                              isExpanded
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <AlertTriangle size={14} className={isExpanded ? "text-indigo-500" : "text-slate-400"} />
                              {isExpanded 
                                ? t.hideTable 
                                : t.showTable.replace("{count}", otherEventsCount.toString())}
                            </span>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-4 space-y-3">
                                  {otherEventsCount === 0 ? (
                                    <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 italic">
                                      {lang === 'en' ? 'No other adverse events reported.' : '未登錄任何其他不良事件項目。'}
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-xl shadow-inner bg-white">
                                      <table className="w-full text-[11px] border-collapse min-w-[650px] font-sans">
                                        <thead className="bg-indigo-50/50 text-indigo-700 border-b border-slate-200">
                                          <tr className="divide-x divide-slate-200/50">
                                            <th className="py-2.5 px-3 text-left font-bold w-1/3 shrink-0">{t.columnEvent}</th>
                                            <th className="py-2.5 px-3 text-left font-bold">{t.columnGroup}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-20 shrink-0">{t.columnAtRisk}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-20 shrink-0">{t.columnAffected}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-20 shrink-0">{t.columnCount}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-24 shrink-0">{t.columnRate}</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-slate-700">
                                          {trial.otherEvents?.flatMap((e, eIdx) => {
                                            const hasStats = e.stats && e.stats.length > 0;
                                            
                                            if (hasStats) {
                                              return e.stats!.map((s, sIdx) => {
                                                const groupInfo = trial.eventGroups?.find(g => g.id === s.groupId);
                                                const groupName = groupInfo?.title || s.groupId;
                                                const atRisk = s.numAtRisk || 0;
                                                const affected = s.numAffected || 0;
                                                const events = s.numEvents || 0;
                                                const pct = atRisk > 0 ? ((affected / atRisk) * 100).toFixed(2) + '%' : '0.00%';
                                                
                                                return (
                                                  <tr 
                                                    key={`${trial.nctId}-other-${eIdx}-${s.groupId}`} 
                                                    className="hover:bg-slate-50/50 transition-colors divide-x divide-slate-100"
                                                  >
                                                    {sIdx === 0 ? (
                                                      <td 
                                                        className="py-3 px-3 font-bold text-slate-800 align-top border-r border-slate-200/50 bg-indigo-50/[0.05]" 
                                                        rowSpan={e.stats!.length}
                                                        style={{ width: '33.333%' }}
                                                      >
                                                        <span className="break-words block font-semibold text-slate-800">{e.term}</span>
                                                        <span className="text-[9px] text-slate-400 font-normal block mt-1">{e.organSystem}</span>
                                                      </td>
                                                    ) : null}
                                                    <td className="py-2.5 px-3 text-slate-600 align-middle">
                                                      <span className="font-medium break-all block">{groupName}</span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-500 align-middle">{atRisk}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-indigo-600 font-semibold align-middle">{affected}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 align-middle">{events}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-600 bg-indigo-50/10 align-middle">{pct}</td>
                                                  </tr>
                                                );
                                              });
                                            } else {
                                              // Fallback if no specific group stats available
                                              const affected = e.numAffected || 0;
                                              const events = e.numEvents || 0;
                                              return (
                                                <tr 
                                                  key={`${trial.nctId}-other-${eIdx}`} 
                                                  className="hover:bg-slate-50/50 transition-colors divide-x divide-slate-100"
                                                >
                                                  <td className="py-3 px-3 font-bold text-slate-800 align-top border-r border-slate-200/50 bg-slate-50/10 w-1/3">
                                                    <span className="break-words block font-semibold text-slate-800">{e.term}</span>
                                                    <span className="text-[9px] text-slate-400 font-normal block mt-1">{e.organSystem}</span>
                                                  </td>
                                                  <td className="py-2.5 px-3 text-slate-400 italic align-middle max-w-xs break-all">
                                                    {t.overallLabel}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 align-middle">-</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-indigo-500 font-semibold align-middle">{affected}</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 align-middle">{events}</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 align-middle">-</td>
                                                </tr>
                                              );
                                            }
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Serious Adverse Events */}
                        <div className="pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleToggleExpandSerious(trial.nctId)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border font-bold text-xs transition-colors ${
                              isSeriousExpanded
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <AlertTriangle size={14} className={isSeriousExpanded ? "text-indigo-500" : "text-slate-400"} />
                              {isSeriousExpanded 
                                ? t.hideSeriousTable 
                                : t.showSeriousTable.replace("{count}", seriousEventsCount.toString())}
                            </span>
                            {isSeriousExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          <AnimatePresence>
                            {isSeriousExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-4 space-y-3">
                                  {seriousEventsCount === 0 ? (
                                    <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 italic">
                                      {lang === 'en' ? 'No serious adverse events reported.' : '未登錄任何嚴重不良事件項目。'}
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-xl shadow-inner bg-white">
                                      <table className="w-full text-[11px] border-collapse min-w-[650px] font-sans">
                                        <thead className="bg-red-50/50 text-red-700 border-b border-slate-200">
                                          <tr className="divide-x divide-slate-200/50">
                                            <th className="py-2.5 px-3 text-left font-bold w-1/3 shrink-0">{t.columnEvent}</th>
                                            <th className="py-2.5 px-3 text-left font-bold">{t.columnGroup}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-20 shrink-0">{t.columnAtRisk}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-20 shrink-0">{t.columnAffected}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-20 shrink-0">{t.columnCount}</th>
                                            <th className="py-2.5 px-3 text-right font-bold w-24 shrink-0">{t.columnRate}</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-slate-700">
                                          {trial.seriousEvents?.flatMap((e, eIdx) => {
                                            const hasStats = e.stats && e.stats.length > 0;
                                            
                                            if (hasStats) {
                                              return e.stats!.map((s, sIdx) => {
                                                const groupInfo = trial.eventGroups?.find(g => g.id === s.groupId);
                                                const groupName = groupInfo?.title || s.groupId;
                                                const atRisk = s.numAtRisk || 0;
                                                const affected = s.numAffected || 0;
                                                const events = s.numEvents || 0;
                                                const pct = atRisk > 0 ? ((affected / atRisk) * 100).toFixed(2) + '%' : '0.00%';
                                                
                                                return (
                                                  <tr 
                                                    key={`${trial.nctId}-serious-${eIdx}-${s.groupId}`} 
                                                    className="hover:bg-slate-50/50 transition-colors divide-x divide-slate-100"
                                                  >
                                                    {sIdx === 0 ? (
                                                      <td 
                                                        className="py-3 px-3 font-bold text-slate-800 align-top border-r border-slate-200/50 bg-red-50/[0.05]" 
                                                        rowSpan={e.stats!.length}
                                                        style={{ width: '33.333%' }}
                                                      >
                                                        <span className="break-words block font-semibold text-slate-800">{e.term}</span>
                                                        <span className="text-[9px] text-slate-400 font-normal block mt-1">{e.organSystem}</span>
                                                      </td>
                                                    ) : null}
                                                    <td className="py-2.5 px-3 text-slate-600 align-middle">
                                                      <span className="font-medium break-all block">{groupName}</span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-500 align-middle">{atRisk}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-red-600 font-semibold align-middle">{affected}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 align-middle">{events}</td>
                                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600 bg-red-50/10 align-middle">{pct}</td>
                                                  </tr>
                                                );
                                              });
                                            } else {
                                              // Fallback if no specific group stats available
                                              const affected = e.numAffected || 0;
                                              const events = e.numEvents || 0;
                                              return (
                                                <tr 
                                                  key={`${trial.nctId}-serious-${eIdx}`} 
                                                  className="hover:bg-slate-50/50 transition-colors divide-x divide-slate-100"
                                                >
                                                  <td className="py-3 px-3 font-bold text-slate-800 align-top border-r border-slate-200/50 bg-slate-50/10 w-1/3">
                                                    <span className="break-words block font-semibold text-slate-800">{e.term}</span>
                                                    <span className="text-[9px] text-slate-400 font-normal block mt-1">{e.organSystem}</span>
                                                  </td>
                                                  <td className="py-2.5 px-3 text-slate-400 italic align-middle max-w-xs break-all">
                                                    {t.overallLabel}
                                                  </td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 align-middle">-</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-red-500 font-semibold align-middle">{affected}</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 align-middle">{events}</td>
                                                  <td className="py-2.5 px-3 text-right font-mono text-slate-300 align-middle">-</td>
                                                </tr>
                                              );
                                            }
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>



                    </div>
                  </motion.div>
                );
              })}
            </div>

          </div>
        )}

      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmReset && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl border border-slate-100 text-center space-y-6"
            >
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <AlertTriangle size={28} />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-slate-800 text-lg leading-tight">{t.resetTitle}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {t.resetWarning}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmReset(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold transition-all text-xs text-slate-600"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleConfirmClearAll}
                  className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all text-xs"
                >
                  {t.confirmReset}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
