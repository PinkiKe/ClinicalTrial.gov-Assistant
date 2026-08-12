import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Table, 
  Info,
  BarChart3,
  Search,
  X,
  Download
} from 'lucide-react';
import { Trial } from '../types';

interface PrimaryOutcomesCacheProps {
  cachedTrials: Trial[];
  onRemoveTrials: (nctIds: string[]) => void;
  onClearAll: () => void;
  lang: 'zh' | 'en';
}

export default function PrimaryOutcomesCache({
  cachedTrials,
  onRemoveTrials,
  onClearAll,
  lang
}: PrimaryOutcomesCacheProps) {
  const [expandedTrials, setExpandedTrials] = useState<Record<string, boolean>>({});
  const [expandedSecondaryTrials, setExpandedSecondaryTrials] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const TEXTS = {
    zh: {
      title: "主要與次要指標暫存資料庫",
      subtitle: "收集並儲存各臨床試驗的詳細主要與次要量測指標數據",
      totalCount: "共儲存 {count} 項試驗",
      selectAll: "全選",
      deselectAll: "取消全選",
      deleteSelected: "刪除選取試驗 ({count})",
      exportCsv: "匯出選取試驗 (CSV)",
      clearCache: "清空所有暫存",
      emptyState: "指標暫存箱目前沒有任何數據",
      emptyStateDesc: "請返回對話諮詢頁面搜尋試驗，並在主要或次要量測指標下方點擊「導入數據」按鈕。",
      backToChat: "前往對話與搜尋",
      trialHeader: "試驗基本資訊",
      nctIdLabel: "試驗編號 (NCT ID)",
      conditionLabel: "疾病狀況 (Conditions)",
      interventionLabel: "介入治療方式 (Interventions)",
      hideTable: "收合主要指標詳細表格",
      showTable: "展開主要指標詳細表格 ({count} 組指標)",
      hideSecondaryTable: "收合次要指標詳細表格",
      showSecondaryTable: "展開次要指標詳細表格 ({count} 組指標)",
      columnMeasure: "測量項目 (單位)",
      columnParamGroup: "分類結果",
      resetTitle: "確認重置暫存資料",
      resetWarning: "您確定要清除所有暫存的臨床試驗量測指標數據嗎？此操作將無法復原。",
      confirmReset: "確認清除",
      cancel: "取消",
      itemsRemoved: "已成功刪除選取的試驗。",
      cacheCleared: "已清空所有暫存試驗。"
    },
    en: {
      title: "Primary & Secondary Outcomes Cache",
      subtitle: "Collect and cache detailed primary and secondary outcome measures across selected clinical trials",
      totalCount: "{count} trials stored",
      selectAll: "Select All",
      deselectAll: "Deselect All",
      deleteSelected: "Delete Selected ({count})",
      exportCsv: "Export Selected (CSV)",
      clearCache: "Clear Cache",
      emptyState: "Outcomes Cache is empty",
      emptyStateDesc: "Go back to the chat room, request outcome measures for a trial, and click 'Import Data'.",
      backToChat: "Back to Chat",
      trialHeader: "Trial Core Metadata",
      nctIdLabel: "Trial ID",
      conditionLabel: "Conditions",
      interventionLabel: "Interventions",
      hideTable: "Collapse Primary Outcomes",
      showTable: "Expand Primary Outcomes ({count} groups)",
      hideSecondaryTable: "Collapse Secondary Outcomes",
      showSecondaryTable: "Expand Secondary Outcomes ({count} groups)",
      columnMeasure: "Measure Item (Unit)",
      columnParamGroup: "Grouping",
      resetTitle: "Confirm Clear Cache",
      resetWarning: "Are you sure you want to clear all stored outcomes? This action cannot be undone.",
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

  const handleToggleExpandSecondary = (nctId: string) => {
    setExpandedSecondaryTrials(prev => ({
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
      lang === 'en' ? "Outcome Classification (Type)" : "Outcome分類結果 (Type)",
      lang === 'en' ? "Measure Item (Unit)" : "測量項目(單位)",
      lang === 'en' ? "Group Name" : "組別名稱",
      lang === 'en' ? "Group Participants (N)" : "組別人數",
      lang === 'en' ? "Measurement Value" : "測量結果數據"
    ];

    const rows: string[][] = [];

    trialsToExport.forEach(trial => {
      const conditionStr = trial.conditions.join("; ");
      const interventionStr = (trial.interventions || []).map(i => `[${i.type}] ${i.name}`).join("; ");
      const primaryMeasures = (trial.resultsData?.outcomeMeasures || []).filter(m => m.type.toUpperCase() === 'PRIMARY');
      const secondaryMeasures = (trial.resultsData?.outcomeMeasures || []).filter(m => m.type.toUpperCase() === 'SECONDARY');
      const allOutcomeMeasures = [...primaryMeasures, ...secondaryMeasures];

      if (allOutcomeMeasures.length === 0) {
        // Fallback row if no specific metrics details registered, to at least export basic info
        rows.push([
          trial.nctId,
          trial.briefTitle,
          conditionStr,
          interventionStr,
          "N/A",
          lang === 'en' ? "No Outcomes Registered" : "未登錄任何指標項目",
          "N/A",
          "N/A",
          "N/A"
        ]);
        return;
      }

      allOutcomeMeasures.forEach(m => {
        const paramType = m.paramType || "N/A";
        const measureUnit = m.unitOfMeasure ? ` (${m.unitOfMeasure})` : "";
        const measureTitle = `${m.title}${measureUnit}`;

        const groupMap = new Map<string, string>();
        if (m.groups) {
          m.groups.forEach((g: any) => {
            groupMap.set(g.id, g.title || g.id);
          });
        }

        const classes = m.classes || [];
        classes.forEach((cl: any) => {
          const classSuffix = cl.title ? ` - ${cl.title}` : "";
          const fullMeasureName = `${measureTitle}${classSuffix}`;

          (cl.categories || []).forEach((cat: any) => {
            (cat.measurements || []).forEach((meas: any) => {
              const grpName = groupMap.get(meas.groupId) || meas.groupId;
              let val = meas.value || "-";
              
              const pType = (m.paramType || '').toUpperCase();
              const spread = meas.spread;
              if (spread) {
                if (pType.includes('MEAN')) {
                  const disp = m.dispersionType || 'SD';
                  val = `${val} (${spread}) [${disp}]`;
                } else if (pType.includes('NUMBER')) {
                  val = `${val} (${spread}%)`;
                } else {
                  const disp = m.dispersionType ? ` [${m.dispersionType}]` : '';
                  val = `${val} (${spread})${disp}`;
                }
              }
              
              // Retrieve group denominator sample size (Group Participants Count)
              const groupDenom = m.denoms?.find((d: any) => d.counts?.some((c: any) => c.groupId === meas.groupId))
                ?.counts?.find((c: any) => c.groupId === meas.groupId)?.value || "-";

              rows.push([
                trial.nctId,
                trial.briefTitle,
                conditionStr,
                interventionStr,
                `${m.type} - ${paramType}`,
                fullMeasureName,
                grpName,
                groupDenom,
                val
              ]);
            });
          });
        });
      });
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
    link.setAttribute("download", `clinical_trials_primary_outcomes_${new Date().toISOString().slice(0, 10)}.csv`);
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
              <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-100 shrink-0">
                <BarChart3 size={14} />
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
                      : 'bg-indigo-55/60 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 active:scale-95 shadow-sm'
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
                  <Trash2 size={13} className="opacity-70" />
                  {t.clearCache}
                </button>
              </div>
            </div>

            {/* List entries */}
            <div className="space-y-6">
              {cachedTrials.map((trial) => {
                const isExpanded = !!expandedTrials[trial.nctId];
                const isSecondaryExpanded = !!expandedSecondaryTrials[trial.nctId];
                const isSelected = selectedIds.has(trial.nctId);
                const primaryMeasures = (trial.resultsData?.outcomeMeasures || []).filter(m => m.type.toUpperCase() === 'PRIMARY');
                const outcomesCount = primaryMeasures.length;
                const secondaryMeasures = (trial.resultsData?.outcomeMeasures || []).filter(m => m.type.toUpperCase() === 'SECONDARY');
                const secondaryOutcomesCount = secondaryMeasures.length;

                return (
                  <motion.div
                    key={trial.nctId}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-white rounded-2xl border transition-all overflow-hidden ${
                      isSelected 
                        ? 'border-indigo-300 ring-4 ring-indigo-55' 
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

                      {/* Collapsible Outcomes Table Area */}
                      <div className="pt-2 border-t border-slate-100 space-y-3">
                        {/* Primary Outcomes */}
                        <div>
                          <button
                            onClick={() => handleToggleExpand(trial.nctId)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border font-bold text-xs transition-colors ${
                              isExpanded
                                ? 'bg-indigo-55/40 border-indigo-200 text-indigo-600'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <BarChart3 size={14} className={isExpanded ? "text-indigo-500" : "text-slate-400"} />
                              {isExpanded 
                                ? t.hideTable 
                                : t.showTable.replace("{count}", outcomesCount.toString())}
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
                                <div className="pt-4 space-y-6">
                                  {outcomesCount === 0 ? (
                                    <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 italic">
                                      {lang === 'en' ? 'No primary outcome measures reported.' : '未登錄任何主要量測指標項目。'}
                                    </div>
                                  ) : (
                                    Object.entries(
                                      primaryMeasures.reduce((acc, m) => {
                                        const type = m.paramType || (lang === 'en' ? 'Other Metric' : '其餘指標');
                                        if (!acc[type]) acc[type] = [];
                                        acc[type].push(m);
                                        return acc;
                                      }, {} as Record<string, any[]>)
                                    ).map(([paramType, measures]) => (
                                      <div key={paramType} className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                          {lang === 'en' ? `${paramType} Grouping` : `${paramType}分類結果`}
                                        </h4>
                                        <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-xl shadow-inner bg-white">
                                          <table className="w-full text-[10px] border-collapse min-w-[500px] font-sans">
                                            <thead>
                                              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                                <th className="py-2.5 px-3 text-left font-bold border-r border-slate-200 bg-slate-100/50 min-w-[180px]">
                                                  {t.columnMeasure}
                                                </th>
                                                {Array.from(new Set(measures.flatMap(m => m.groups?.map(g => g.id) || []))).map(groupId => {
                                                  const groupInfo = measures.find(m => m.groups?.some(g => g.id === groupId))?.groups?.find(g => g.id === groupId);
                                                  const denom = measures[0]?.denoms?.find((d: any) => d.counts?.some((c: any) => c.groupId === groupId))?.counts?.find((c: any) => c.groupId === groupId)?.value;
                                                  return (
                                                    <th key={groupId} className="py-2.5 px-3 text-center font-bold min-w-[100px]">
                                                      <div className="text-slate-800">{groupInfo?.title || groupId}</div>
                                                      {denom && <div className="text-[9px] text-slate-400 font-normal">N = {denom}</div>}
                                                    </th>
                                                  );
                                                })}
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {measures.flatMap((m, mIdx) => (m.classes || []).map((cl, clIdx) => (
                                                <tr key={`${mIdx}-${clIdx}`} className="hover:bg-slate-50/50 transition-colors">
                                                  <td className="py-2.5 px-3 font-medium text-slate-700 border-r border-slate-100">
                                                    {clIdx === 0 ? <span className="font-bold">{m.title} {m.unitOfMeasure && `(${m.unitOfMeasure})`}</span> : <span className="text-[9px] text-slate-300 italic">{lang === 'en' ? '(Cont.)' : '（續）'}{m.title}</span>}
                                                    {cl.title && <div className="text-[9px] text-indigo-500 font-bold mt-1">{cl.title}</div>}
                                                    {clIdx === 0 && (
                                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                                        <span className="text-[8px] bg-slate-100 text-slate-600 font-medium font-mono px-1 py-0.5 rounded uppercase tracking-wider">
                                                          {lang === 'en' ? `Type: ${m.paramType || 'N/A'}` : `指標類別: ${m.paramType || 'N/A'}`}
                                                        </span>
                                                        {m.dispersionType && (
                                                          <span className="text-[8px] bg-indigo-55 text-indigo-600 font-medium font-mono px-1 py-0.5 rounded uppercase tracking-wider">
                                                            {lang === 'en' ? `Dispersion: ${m.dispersionType}` : `離散度類別: ${m.dispersionType}`}
                                                          </span>
                                                        )}
                                                      </div>
                                                    )}
                                                  </td>
                                                  {Array.from(new Set(measures.flatMap(ms => ms.groups?.map(g => g.id) || []))).map(groupId => {
                                                    const meas = cl.categories?.[0]?.measurements?.find((v: any) => v.groupId === groupId);
                                                    const val = meas?.value || '-';
                                                    const spread = meas?.spread;
                                                    
                                                    const pType = (m.paramType || '').toUpperCase();
                                                    const isMean = pType.includes('MEAN');
                                                    const isNumber = pType.includes('NUMBER');

                                                    return (
                                                      <td key={groupId} className="py-2.5 px-3 text-center text-slate-600 font-mono">
                                                        <div className="font-semibold text-slate-850 flex items-center justify-center gap-1 flex-wrap">
                                                          <span className="text-[11px]">{val}</span>
                                                          {val !== '-' && spread && (
                                                            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-55 px-1 py-0.5 rounded" title={m.dispersionType || 'Dispersion'}>
                                                              ({spread})
                                                            </span>
                                                          )}
                                                        </div>
                                                        {val !== '-' && spread && (
                                                          <div className="text-[8px] text-slate-400 font-sans mt-0.5 block font-normal text-center">
                                                            {isMean ? `[${m.dispersionType || 'SD'}]` : isNumber ? '[% participants]' : `[${m.dispersionType || 'Spread'}]`}
                                                          </div>
                                                        )}
                                                      </td>
                                                    );
                                                  })}
                                                </tr>
                                              )))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Secondary Outcomes */}
                        <div className="pt-2 border-t border-slate-100">
                          <button
                            onClick={() => handleToggleExpandSecondary(trial.nctId)}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border font-bold text-xs transition-colors ${
                              isSecondaryExpanded
                                ? 'bg-indigo-55/40 border-indigo-200 text-indigo-600'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <BarChart3 size={14} className={isSecondaryExpanded ? "text-indigo-500" : "text-slate-400"} />
                              {isSecondaryExpanded 
                                ? t.hideSecondaryTable 
                                : t.showSecondaryTable.replace("{count}", secondaryOutcomesCount.toString())}
                            </span>
                            {isSecondaryExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>

                          <AnimatePresence>
                            {isSecondaryExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="pt-4 space-y-6">
                                  {secondaryOutcomesCount === 0 ? (
                                    <div className="text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 italic">
                                      {lang === 'en' ? 'No secondary outcome measures reported.' : '未登錄任何次要量測指標項目。'}
                                    </div>
                                  ) : (
                                    Object.entries(
                                      secondaryMeasures.reduce((acc, m) => {
                                        const type = m.paramType || (lang === 'en' ? 'Other Metric' : '其餘指標');
                                        if (!acc[type]) acc[type] = [];
                                        acc[type].push(m);
                                        return acc;
                                      }, {} as Record<string, any[]>)
                                    ).map(([paramType, measures]) => (
                                      <div key={paramType} className="space-y-3">
                                        <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                          {lang === 'en' ? `${paramType} Grouping` : `${paramType}分類結果`}
                                        </h4>
                                        <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-xl shadow-inner bg-white">
                                          <table className="w-full text-[10px] border-collapse min-w-[500px] font-sans">
                                            <thead>
                                              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                                <th className="py-2.5 px-3 text-left font-bold border-r border-slate-200 bg-slate-100/50 min-w-[180px]">
                                                  {t.columnMeasure}
                                                </th>
                                                {Array.from(new Set(measures.flatMap(m => m.groups?.map(g => g.id) || []))).map(groupId => {
                                                  const groupInfo = measures.find(m => m.groups?.some(g => g.id === groupId))?.groups?.find(g => g.id === groupId);
                                                  const denom = measures[0]?.denoms?.find((d: any) => d.counts?.some((c: any) => c.groupId === groupId))?.counts?.find((c: any) => c.groupId === groupId)?.value;
                                                  return (
                                                    <th key={groupId} className="py-2.5 px-3 text-center font-bold min-w-[100px]">
                                                      <div className="text-slate-800">{groupInfo?.title || groupId}</div>
                                                      {denom && <div className="text-[9px] text-slate-400 font-normal">N = {denom}</div>}
                                                    </th>
                                                  );
                                                })}
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {measures.flatMap((m, mIdx) => (m.classes || []).map((cl, clIdx) => (
                                                <tr key={`${mIdx}-${clIdx}`} className="hover:bg-slate-50/50 transition-colors">
                                                  <td className="py-2.5 px-3 font-medium text-slate-700 border-r border-slate-100">
                                                    {clIdx === 0 ? <span className="font-bold">{m.title} {m.unitOfMeasure && `(${m.unitOfMeasure})`}</span> : <span className="text-[9px] text-slate-300 italic">{lang === 'en' ? '(Cont.)' : '（續）'}{m.title}</span>}
                                                    {cl.title && <div className="text-[9px] text-indigo-500 font-bold mt-1">{cl.title}</div>}
                                                    {clIdx === 0 && (
                                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                                        <span className="text-[8px] bg-slate-100 text-slate-600 font-medium font-mono px-1 py-0.5 rounded uppercase tracking-wider">
                                                          {lang === 'en' ? `Type: ${m.paramType || 'N/A'}` : `指標類別: ${m.paramType || 'N/A'}`}
                                                        </span>
                                                        {m.dispersionType && (
                                                          <span className="text-[8px] bg-indigo-55 text-indigo-600 font-medium font-mono px-1 py-0.5 rounded uppercase tracking-wider">
                                                            {lang === 'en' ? `Dispersion: ${m.dispersionType}` : `離散度類別: ${m.dispersionType}`}
                                                          </span>
                                                        )}
                                                      </div>
                                                    )}
                                                  </td>
                                                  {Array.from(new Set(measures.flatMap(ms => ms.groups?.map(g => g.id) || []))).map(groupId => {
                                                    const meas = cl.categories?.[0]?.measurements?.find((v: any) => v.groupId === groupId);
                                                    const val = meas?.value || '-';
                                                    const spread = meas?.spread;
                                                    
                                                    const pType = (m.paramType || '').toUpperCase();
                                                    const isMean = pType.includes('MEAN');
                                                    const isNumber = pType.includes('NUMBER');

                                                    return (
                                                      <td key={groupId} className="py-2.5 px-3 text-center text-slate-600 font-mono">
                                                        <div className="font-semibold text-slate-850 flex items-center justify-center gap-1 flex-wrap">
                                                          <span className="text-[11px]">{val}</span>
                                                          {val !== '-' && spread && (
                                                            <span className="text-[10px] text-indigo-600 font-bold bg-indigo-55 px-1 py-0.5 rounded" title={m.dispersionType || 'Dispersion'}>
                                                              ({spread})
                                                            </span>
                                                          )}
                                                        </div>
                                                        {val !== '-' && spread && (
                                                          <div className="text-[8px] text-slate-400 font-sans mt-0.5 block font-normal text-center">
                                                            {isMean ? `[${m.dispersionType || 'SD'}]` : isNumber ? '[% participants]' : `[${m.dispersionType || 'Spread'}]`}
                                                          </div>
                                                        )}
                                                      </td>
                                                    );
                                                  })}
                                                </tr>
                                              )))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ))
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
              <div className="w-14 h-14 bg-red-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <BarChart3 size={28} />
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
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all text-xs"
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
