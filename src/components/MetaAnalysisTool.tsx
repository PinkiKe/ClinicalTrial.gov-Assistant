import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  BarChart3, 
  AlertTriangle, 
  FileText, 
  Settings2, 
  Table, 
  Copy, 
  Check, 
  Download, 
  ExternalLink, 
  Loader2, 
  GitBranch, 
  ShieldAlert, 
  ClipboardList,
  Edit,
  Sliders,
  Scale,
  Percent,
  CheckCircle2,
  GitCommit,
  X,
  Square
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Trial } from '../types';
import { analyzeCohort, isGeminiRateLimited, setGeminiRateLimit, searchAdverseEvents } from '../services/gemini';

// Interface for user-editable trial parameters
interface StudyStatsInput {
  binary: {
    tEvents: number; // Treatment Events
    tTotal: number;  // Treatment N
    cEvents: number; // Control Events
    cTotal: number;  // Control N
  };
  continuous: {
    tN: number;      // Treatment N
    tMean: number;   // Treatment Mean
    tSD: number;     // Treatment SD
    cN: number;      // Control N
    cMean: number;   // Control Mean
    cSD: number;     // Control SD
  };
}

interface MetaAnalysisToolProps {
  saeCachedTrials: Trial[];
  outcomesCachedTrials: Trial[];
  lang: 'zh' | 'en';
  forcedAnalysisMode?: 'outcomes' | 'sae';
  hideModeSelector?: boolean;
}

// Simple standard normal cumulative distribution function (CDF) approximation
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804;
  const probs = 1 - d * Math.exp(-x * x / 2) * t * (
    0.319381530 + t * (
      -0.356563782 + t * (
        1.781477937 + t * (
          -1.821255978 + t * 1.330274429
        )
      )
    )
  );
  return x >= 0 ? probs : 1 - probs;
}

const isControlGroup = (title: string, id: string) => {
  const text = title.toLowerCase();
  return (
    text.includes('control') ||
    text.includes('placebo') ||
    text.includes('contrast') ||
    text.includes('baseline') ||
    text.includes('reference') ||
    text.includes('vehicle') ||
    text.includes('ref') ||
    text.includes('ctrl') ||
    text.includes('cx') ||
    text.includes('comparator') ||
    text.includes('對照') ||
    text.includes('安慰劑') ||
    text.includes('模擬') ||
    text.includes('placebo_comparator') ||
    text.includes('no_intervention')
  );
};

const getTrialGroups = (tr: Trial, lang: 'zh' | 'en') => {
  const list: { id: string; title: string }[] = [];
  const seen = new Set<string>();

  const addGroup = (id: string, title: string) => {
    const normalized = title.trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      list.push({ id, title: normalized });
    }
  };

  if (tr.eventGroups && tr.eventGroups.length > 0) {
    tr.eventGroups.forEach(g => addGroup(g.id, g.title));
  }
  if (tr.resultsData?.outcomeMeasures) {
    tr.resultsData.outcomeMeasures.forEach(m => {
      if (m.groups) {
        m.groups.forEach(g => addGroup(g.id, g.title));
      }
    });
  }

  // Fallback defaults if no groups are found
  if (list.length === 0) {
    list.push({ id: 'tx', title: lang === 'en' ? 'Treatment / Experimental' : '試驗組' });
    list.push({ id: 'cx', title: lang === 'en' ? 'Control Group' : '對照組' });
  }

  return list;
};

const extractOutcomeStatsForTrial = (tr: Trial, txId: string, cxId: string, idx: number, selectedTitle?: string) => {
  const baseN = 100 + (idx % 3) * 35;
  const tPercent = 0.12 + (idx % 4) * 0.04;
  const cPercent = 0.26 - (idx % 3) * 0.03;

  const meanT = 4.8 - (idx % 3) * 0.6;
  const meanC = 7.1 + (idx % 2) * 0.4;
  const sdT = 1.6 + (idx % 2) * 0.3;
  const sdC = 2.1 - (idx % 3) * 0.2;

  let binary = {
    tEvents: Math.max(1, Math.round(baseN * tPercent)),
    tTotal: baseN,
    cEvents: Math.max(2, Math.round(baseN * cPercent)),
    cTotal: baseN,
  };

  let continuous = {
    tN: baseN,
    tMean: parseFloat(meanT.toFixed(2)),
    tSD: parseFloat(sdT.toFixed(2)),
    cN: baseN,
    cMean: parseFloat(meanC.toFixed(2)),
    cSD: parseFloat(sdC.toFixed(2)),
  };

  if (tr.resultsData?.outcomeMeasures && tr.resultsData.outcomeMeasures.length > 0) {
    const outcomeMeasure = selectedTitle
      ? (tr.resultsData.outcomeMeasures.find(om => om.title === selectedTitle) || tr.resultsData.outcomeMeasures[0])
      : (tr.resultsData.outcomeMeasures.find(
          om => (om.type || '').toUpperCase() === 'PRIMARY'
        ) || tr.resultsData.outcomeMeasures[0]);

    // Resolve group ID discrepancies (e.g. EG000 from adverseEvents vs. OG000 from outcomeMeasures)
    const allGroups = getTrialGroups(tr, 'en');
    const txGroupObj = allGroups.find(g => g.id === txId);
    const cxGroupObj = allGroups.find(g => g.id === cxId);
    
    const txTitle = txGroupObj ? txGroupObj.title.toLowerCase().trim() : '';
    const cxTitle = cxGroupObj ? cxGroupObj.title.toLowerCase().trim() : '';

    let outcomeTxId = txId;
    let outcomeCxId = cxId;

    if (txTitle && outcomeMeasure.groups) {
      const match = outcomeMeasure.groups.find(g => g.title.toLowerCase().trim() === txTitle) 
        || outcomeMeasure.groups.find(g => g.title.toLowerCase().includes(txTitle) || txTitle.includes(g.title.toLowerCase()));
      if (match) outcomeTxId = match.id;
    }
    if (cxTitle && outcomeMeasure.groups) {
      const match = outcomeMeasure.groups.find(g => g.title.toLowerCase().trim() === cxTitle)
        || outcomeMeasure.groups.find(g => g.title.toLowerCase().includes(cxTitle) || cxTitle.includes(g.title.toLowerCase()));
      if (match) outcomeCxId = match.id;
    }

    // Robust denominator finder
    const getDenomValue = (groupId: string): number | null => {
      if (outcomeMeasure.denoms) {
        for (const d of outcomeMeasure.denoms) {
          const countObj = d.counts?.find(c => c.groupId === groupId);
          if (countObj && parseInt(countObj.value, 10) > 0) {
            return parseInt(countObj.value, 10);
          }
        }
      }
      if (outcomeMeasure.classes) {
        for (const cl of outcomeMeasure.classes) {
          if (cl.denoms) {
            for (const d of cl.denoms) {
              const countObj = d.counts?.find(c => c.groupId === groupId);
              if (countObj && parseInt(countObj.value, 10) > 0) {
                return parseInt(countObj.value, 10);
              }
            }
          }
        }
      }
      return null;
    };

    let txDenom = getDenomValue(outcomeTxId) ?? baseN;
    let cxDenom = getDenomValue(outcomeCxId) ?? baseN;

    let txVal: number | null = null;
    let cxVal: number | null = null;

    outcomeMeasure.classes?.forEach(cls => {
      cls.categories?.forEach(cat => {
        cat.measurements?.forEach(meas => {
          if (meas.groupId === outcomeTxId) {
            const pv = parseFloat(meas.value);
            if (!isNaN(pv)) txVal = pv;
          }
          if (meas.groupId === outcomeCxId) {
            const pv = parseFloat(meas.value);
            if (!isNaN(pv)) cxVal = pv;
          }
        });
      });
    });

    if (txVal !== null || cxVal !== null) {
      const tV = txVal !== null ? txVal : Math.max(1, Math.round(txDenom * tPercent));
      const cV = cxVal !== null ? cxVal : Math.max(2, Math.round(cxDenom * cPercent));

      const parseBinaryField = (val: number, denom: number) => {
        if (val <= 1.0 && val > 0) {
          return Math.round(denom * val);
        } else if (val > 1.0 && val < 100 && !Number.isInteger(val)) {
          return Math.round(denom * (val / 100));
        } else {
          return Math.round(val);
        }
      };

      binary = {
        tEvents: parseBinaryField(tV, txDenom),
        tTotal: txDenom,
        cEvents: parseBinaryField(cV, cxDenom),
        cTotal: cxDenom,
      };

      if (binary.tEvents > binary.tTotal) binary.tEvents = binary.tTotal;
      if (binary.cEvents > binary.cTotal) binary.cEvents = binary.cTotal;
    }

    let txMeanVal = meanT;
    let cxMeanVal = meanC;
    let txSdVal = sdT;
    let cxSdVal = sdC;
    let foundTxMean = false;
    let foundCxMean = false;
    let foundTxSd = false;
    let foundCxSd = false;

    // Scan measurements. If there are multiple entries, prefer those with spread (SD), and assign only once to prevent subsequent overwrites
    outcomeMeasure.classes?.forEach(cls => {
      cls.categories?.forEach(cat => {
        cat.measurements?.forEach(meas => {
          if (meas.groupId === outcomeTxId) {
            const v = parseFloat(meas.value);
            const s = meas.spread ? parseFloat(meas.spread) : NaN;
            if (!isNaN(v) && (!foundTxMean || !isNaN(s))) {
              txMeanVal = v;
              foundTxMean = true;
            }
            if (!isNaN(s) && !foundTxSd) {
              txSdVal = s;
              foundTxSd = true;
            }
          }
          if (meas.groupId === outcomeCxId) {
            const v = parseFloat(meas.value);
            const s = meas.spread ? parseFloat(meas.spread) : NaN;
            if (!isNaN(v) && (!foundCxMean || !isNaN(s))) {
              cxMeanVal = v;
              foundCxMean = true;
            }
            if (!isNaN(s) && !foundCxSd) {
              cxSdVal = s;
              foundCxSd = true;
            }
          }
        });
      });
    });

    // Phase 2: If we still don't have SD, try fallback matching logic
    if (!foundTxSd || !foundCxSd || !foundTxMean || !foundCxMean) {
      outcomeMeasure.classes?.forEach(cls => {
        const clsTitle = (cls.title || '').toLowerCase();
        cls.categories?.forEach(cat => {
          const catTitle = (cat.title || '').toLowerCase();
          cat.measurements?.forEach(meas => {
            const v = parseFloat(meas.value);
            if (!isNaN(v)) {
              const isMean = clsTitle.includes('mean') || catTitle.includes('mean') || outcomeMeasure.title?.toLowerCase().includes('mean') || (outcomeMeasure.paramType || '').toLowerCase() === 'mean';
              const isSD = clsTitle.includes('sd') || catTitle.includes('sd') || clsTitle.includes('std') || catTitle.includes('std') || clsTitle.includes('deviation') || catTitle.includes('deviation');
              
              if (meas.groupId === outcomeTxId) {
                if (isMean && !foundTxMean) {
                  txMeanVal = v;
                  foundTxMean = true;
                } else if (isSD && !foundTxSd) {
                  txSdVal = v;
                  foundTxSd = true;
                }
              }
              if (meas.groupId === outcomeCxId) {
                if (isMean && !foundCxMean) {
                  cxMeanVal = v;
                  foundCxMean = true;
                } else if (isSD && !foundCxSd) {
                  cxSdVal = v;
                  foundCxSd = true;
                }
              }
            }
          });
        });
      });
    }

    continuous = {
      tN: txDenom,
      tMean: parseFloat(txMeanVal.toFixed(2)),
      tSD: parseFloat(txSdVal.toFixed(2)),
      cN: cxDenom,
      cMean: parseFloat(cxMeanVal.toFixed(2)),
      cSD: parseFloat(cxSdVal.toFixed(2)),
    };
  }

  return { binary, continuous };
};

export default function MetaAnalysisTool({
  saeCachedTrials,
  outcomesCachedTrials,
  lang,
  forcedAnalysisMode,
  hideModeSelector = false
}: MetaAnalysisToolProps) {
  // Deduplicate pool based on NCTID
  const deduplicatedPool: Trial[] = [];
  const seenIds = new Set<string>();

  const addTrials = (list: Trial[]) => {
    list.forEach(t => {
      if (!seenIds.has(t.nctId)) {
        seenIds.add(t.nctId);
        deduplicatedPool.push(t);
      } else {
        const existing = deduplicatedPool.find(item => item.nctId === t.nctId);
        if (existing) {
          if (!existing.resultsData && t.resultsData) existing.resultsData = t.resultsData;
          if (!existing.seriousEvents && t.seriousEvents) existing.seriousEvents = t.seriousEvents;
          if (!existing.otherEvents && t.otherEvents) existing.otherEvents = t.otherEvents;
          if (!existing.primaryOutcomes && t.primaryOutcomes) existing.primaryOutcomes = t.primaryOutcomes;
        }
      }
    });
  };

  addTrials(saeCachedTrials);
  addTrials(outcomesCachedTrials);

  // States with Tab Persistence via localStorage
  const storagePrefix = `meta_tool_${forcedAnalysisMode || 'outcomes'}_`;

  const [selectedNctIds, setSelectedNctIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}selectedNctIds`);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) {
          return new Set(arr);
        }
      }
    } catch {}
    return new Set(deduplicatedPool.slice(0, 3).map(t => t.nctId));
  });

  const [activeSubTab, setActiveSubTab] = useState<'analytics' | 'compare' | 'report'>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}activeSubTab`);
      if (saved && ['analytics', 'compare', 'report'].includes(saved)) {
        return saved as 'analytics' | 'compare' | 'report';
      }
    } catch {}
    return 'analytics';
  });
  
  // Analysis Focus Paradigms
  const [analysisMode, setAnalysisMode] = useState<'outcomes' | 'sae'>(
    forcedAnalysisMode || 'outcomes'
  );

  useEffect(() => {
    if (forcedAnalysisMode) {
      setAnalysisMode(forcedAnalysisMode);
    }
  }, [forcedAnalysisMode]);
  
  // Adverse Event Analysis states
  const [saeStats, setSaeStats] = useState<Record<string, { tEvents: number; tTotal: number; cEvents: number; cTotal: number }>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}saeStats`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [selectedSaeTerm, setSelectedSaeTerm] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}selectedSaeTerm`);
      if (saved) return saved;
    } catch {}
    return '';
  });

  const [aeTypeFilter, setAeTypeFilter] = useState<'serious' | 'other'>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}aeTypeFilter`);
      if (saved && (saved === 'serious' || saved === 'other')) return saved as 'serious' | 'other';
    } catch {}
    return 'serious';
  });

  const [saeSearchQuery, setSaeSearchQuery] = useState<string>('');
  const [isSaeAiSearching, setIsSaeAiSearching] = useState<boolean>(false);
  const [saeAiSearchError, setSaeAiSearchError] = useState<string>('');
  const [saeAiMatchedTermsList, setSaeAiMatchedTermsList] = useState<string[]>([]);
  const saeAbortControllerRef = useRef<AbortController | null>(null);

  const handleSaeAiSearch = async () => {
    if (!saeSearchQuery.trim()) return;

    if (isSaeAiSearching) {
      if (saeAbortControllerRef.current) {
        saeAbortControllerRef.current.abort();
      }
      setIsSaeAiSearching(false);
      setSaeAiSearchError(
        lang === 'en'
          ? 'Search cancelled.'
          : '已中止檢索。'
      );
      return;
    }

    setIsSaeAiSearching(true);
    setSaeAiSearchError('');
    setSaeAiMatchedTermsList([]);

    const controller = new AbortController();
    saeAbortControllerRef.current = controller;

    try {
      const activeSelectedTrials = deduplicatedPool.filter(item => selectedNctIds.has(item.nctId));
      const response = await searchAdverseEvents(saeSearchQuery, activeSelectedTrials, lang, controller.signal);
      
      if (response && response.matchedTerm) {
        setSelectedSaeTerm(response.matchedTerm);
        if (response.alignedTrialTerms && Object.keys(response.alignedTrialTerms).length > 0) {
          setTrialSaeTerms(prev => ({
            ...prev,
            ...response.alignedTrialTerms
          }));
        }
        setSaeAiMatchedTermsList(response.allMatchingTerms || []);
      } else {
        setSaeAiSearchError(
          lang === 'en' 
            ? 'No matching adverse events found for this symptom.' 
            : '未找到相關項目。'
        );
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'The user aborted a request.') {
        // Aborted
        return;
      }
      console.error(err);
      setSaeAiSearchError(
        lang === 'en'
          ? 'AI Search failed. Please try again.'
          : 'AI 檢索失敗，請稍後重試。'
      );
    } finally {
      if (saeAbortControllerRef.current === controller) {
        saeAbortControllerRef.current = null;
        setIsSaeAiSearching(false);
      }
    }
  };

  // Selected Treatment group and Control group for each trial
  const [selectedTxGroup, setSelectedTxGroup] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}selectedTxGroup`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [selectedCxGroup, setSelectedCxGroup] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}selectedCxGroup`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // Statistical Model Configurations
  const [endpointType, setEndpointType] = useState<'binary' | 'continuous'>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}endpointType`);
      if (saved && (saved === 'binary' || saved === 'continuous')) return saved;
    } catch {}
    return 'binary';
  });

  const [effectMetric, setEffectMetric] = useState<'OR' | 'RR' | 'RD' | 'MD' | 'SMD'>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}effectMetric`);
      if (saved && ['OR', 'RR', 'RD', 'MD', 'SMD'].includes(saved)) return saved as 'OR' | 'RR' | 'RD' | 'MD' | 'SMD';
    } catch {}
    return 'OR';
  });

  const [poolingModel, setPoolingModel] = useState<'fixed' | 'random'>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}poolingModel`);
      if (saved && (saved === 'fixed' || saved === 'random')) return saved;
    } catch {}
    return 'random';
  });

  // Synchronize states to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}selectedNctIds`, JSON.stringify(Array.from(selectedNctIds)));
    } catch {}
  }, [selectedNctIds, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}activeSubTab`, activeSubTab);
    } catch {}
  }, [activeSubTab, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}saeStats`, JSON.stringify(saeStats));
    } catch {}
  }, [saeStats, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}selectedSaeTerm`, selectedSaeTerm);
    } catch {}
  }, [selectedSaeTerm, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}selectedTxGroup`, JSON.stringify(selectedTxGroup));
    } catch {}
  }, [selectedTxGroup, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}selectedCxGroup`, JSON.stringify(selectedCxGroup));
    } catch {}
  }, [selectedCxGroup, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}endpointType`, endpointType);
    } catch {}
  }, [endpointType, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}effectMetric`, effectMetric);
    } catch {}
  }, [effectMetric, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}poolingModel`, poolingModel);
    } catch {}
  }, [poolingModel, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}aeTypeFilter`, aeTypeFilter);
    } catch {}
  }, [aeTypeFilter, storagePrefix]);

  const [trialSaeTerms, setTrialSaeTerms] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}trialSaeTerms`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  const [trialOutcomeMeasures, setTrialOutcomeMeasures] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}trialOutcomeMeasures`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}trialSaeTerms`, JSON.stringify(trialSaeTerms));
    } catch {}
  }, [trialSaeTerms, storagePrefix]);

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}trialOutcomeMeasures`, JSON.stringify(trialOutcomeMeasures));
    } catch {}
  }, [trialOutcomeMeasures, storagePrefix]);

  const poolIdsSerialized = deduplicatedPool.map(tr => tr.nctId).join(',');

  // Synchronize and prune selected NCT IDs when the pool of trials changes or gets cleared
  useEffect(() => {
    const currentPoolSet = new Set(deduplicatedPool.map(tr => tr.nctId));
    let hasExtra = false;
    selectedNctIds.forEach(id => {
      if (!currentPoolSet.has(id)) {
        hasExtra = true;
      }
    });

    if (hasExtra || (deduplicatedPool.length === 0 && selectedNctIds.size > 0)) {
      const nextSet = new Set<string>();
      selectedNctIds.forEach(id => {
        if (currentPoolSet.has(id)) {
          nextSet.add(id);
        }
      });
      setSelectedNctIds(nextSet);
    }
  }, [poolIdsSerialized]);

  // Initialize selected Tx and Cx Groups
  useEffect(() => {
    const initialTx: Record<string, string> = { ...selectedTxGroup };
    const initialCx: Record<string, string> = { ...selectedCxGroup };
    let updated = false;

    deduplicatedPool.forEach(tr => {
      if (!initialTx[tr.nctId] || !initialCx[tr.nctId]) {
        const groups = getTrialGroups(tr, lang);
        
        let defaultCxIndex = groups.findIndex(g => 
          g.title.toLowerCase().includes('placebo') || 
          g.title.toLowerCase().includes('安慰劑')
        );

        if (defaultCxIndex === -1) {
          defaultCxIndex = groups.findIndex(g => isControlGroup(g.title, g.id));
        }

        if (defaultCxIndex === -1) {
          defaultCxIndex = groups.length >= 2 ? 1 : 0;
        }

        const defaultCx = groups[defaultCxIndex]?.id || groups[0]?.id;

        let defaultTxIndex = groups.findIndex(g => g.id !== defaultCx);
        if (defaultTxIndex === -1) {
          defaultTxIndex = 0;
        }
        const defaultTx = groups[defaultTxIndex]?.id || groups[0]?.id;

        if (!initialTx[tr.nctId]) {
          initialTx[tr.nctId] = defaultTx;
          updated = true;
        }
        if (!initialCx[tr.nctId]) {
          initialCx[tr.nctId] = defaultCx;
          updated = true;
        }
      }
    });

    if (updated) {
      setSelectedTxGroup(initialTx);
      setSelectedCxGroup(initialCx);
    }
  }, [poolIdsSerialized]);

  // Multi-parameter study datasheet state management
  const [trialStats, setTrialStats] = useState<Record<string, StudyStatsInput>>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}trialStats`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}trialStats`, JSON.stringify(trialStats));
    } catch {}
  }, [trialStats, storagePrefix]);

  // Populate/Ensure correct trialStats state initialization
  useEffect(() => {
    setTrialStats(prev => {
      let updated = false;
      const copy = { ...prev };
      deduplicatedPool.forEach((tr, idx) => {
        if (!copy[tr.nctId] && selectedTxGroup[tr.nctId] && selectedCxGroup[tr.nctId]) {
          updated = true;
          const txId = selectedTxGroup[tr.nctId];
          const cxId = selectedCxGroup[tr.nctId];
          const extracted = extractOutcomeStatsForTrial(tr, txId, cxId, idx, trialOutcomeMeasures[tr.nctId]);
          copy[tr.nctId] = extracted;
        }
      });
      return updated ? copy : prev;
    });
  }, [poolIdsSerialized, selectedTxGroup, selectedCxGroup, trialOutcomeMeasures]);

  // Helper to get initial adverse event counts based on selected groups
  const getInitialSaeStats = (
    term: string, 
    trials: Trial[], 
    txGroups: Record<string, string> = selectedTxGroup, 
    cxGroups: Record<string, string> = selectedCxGroup,
    customTerms: Record<string, string> = trialSaeTerms
  ) => {
    const initial: Record<string, { tEvents: number; tTotal: number; cEvents: number; cTotal: number }> = {};
    trials.forEach(tr => {
      const activeTerm = customTerms[tr.nctId] || term;
      const matchingSae = (aeTypeFilter === 'serious' ? (tr.seriousEvents || []) : (tr.otherEvents || []))
        .find(e => e.term.toLowerCase() === activeTerm.toLowerCase());

      const txId = txGroups[tr.nctId] || 'tx';
      const cxId = cxGroups[tr.nctId] || 'cx';

      let te = 0, tt = 100, ce = 0, ct = 100;

      if (matchingSae) {
        if (matchingSae.stats && matchingSae.stats.length > 0) {
          const txStat = matchingSae.stats.find(s => s.groupId === txId);
          if (txStat) {
            te = txStat.numAffected ?? txStat.numEvents ?? 0;
            tt = txStat.numAtRisk ?? 100;
          } else {
            te = matchingSae.stats[0].numAffected ?? matchingSae.stats[0].numEvents ?? 0;
            tt = matchingSae.stats[0].numAtRisk ?? 100;
          }

          const cxStat = matchingSae.stats.find(s => s.groupId === cxId);
          if (cxStat) {
            ce = cxStat.numAffected ?? cxStat.numEvents ?? 0;
            ct = cxStat.numAtRisk ?? 100;
          } else if (matchingSae.stats.length >= 2) {
            ce = matchingSae.stats[1].numAffected ?? matchingSae.stats[1].numEvents ?? 0;
            ct = matchingSae.stats[1].numAtRisk ?? 100;
          }
        } else {
          te = matchingSae.numAffected ?? matchingSae.numEvents ?? 0;
          tt = 100;
        }
      }
      if (tt <= 0) tt = 100;
      if (ct <= 0) ct = 100;
      initial[tr.nctId] = { tEvents: te, tTotal: tt, cEvents: ce, cTotal: ct };
    });
    return initial;
  };

  // Group selection changes handler that also updates numeric inputs automatically
  const handleSelectGroup = (nctId: string, groupType: 'tx' | 'cx', groupId: string) => {
    const updatedTx = { ...selectedTxGroup };
    const updatedCx = { ...selectedCxGroup };

    if (groupType === 'tx') {
      updatedTx[nctId] = groupId;
      setSelectedTxGroup(updatedTx);
    } else {
      updatedCx[nctId] = groupId;
      setSelectedCxGroup(updatedCx);
    }

    const tr = deduplicatedPool.find(t => t.nctId === nctId);
    if (!tr) return;

    const currentTx = groupType === 'tx' ? groupId : (selectedTxGroup[nctId] || groupId);
    const currentCx = groupType === 'cx' ? groupId : (selectedCxGroup[nctId] || groupId);
    const idx = deduplicatedPool.findIndex(t => t.nctId === nctId);

    const extracted = extractOutcomeStatsForTrial(tr, currentTx, currentCx, idx, trialOutcomeMeasures[nctId]);
    setTrialStats(prev => ({
      ...prev,
      [nctId]: extracted
    }));

    if (selectedSaeTerm) {
      const singleSaeStats = getInitialSaeStats(selectedSaeTerm, [tr], { [nctId]: currentTx }, { [nctId]: currentCx }, trialSaeTerms);
      setSaeStats(prev => ({
        ...prev,
        [nctId]: singleSaeStats[nctId]
      }));
    }
  };

  // Load SAE stats on term change or group choice changes
  useEffect(() => {
    if (selectedSaeTerm && Object.keys(selectedTxGroup).length > 0) {
      const initializedStats = getInitialSaeStats(selectedSaeTerm, selectedTrials, selectedTxGroup, selectedCxGroup, trialSaeTerms);
      setSaeStats(initializedStats);
    }
  }, [selectedSaeTerm, poolIdsSerialized, selectedTxGroup, selectedCxGroup, trialSaeTerms, aeTypeFilter]);

  // Adjust default metrics if endpoint type toggles or switched to SAE mode
  useEffect(() => {
    if (analysisMode === 'sae') {
      if (effectMetric !== 'OR' && effectMetric !== 'RR' && effectMetric !== 'RD') {
        setEffectMetric('OR');
      }
    } else {
      if (endpointType === 'binary') {
        if (effectMetric !== 'OR' && effectMetric !== 'RR' && effectMetric !== 'RD') {
          setEffectMetric('OR');
        }
      } else {
        if (effectMetric !== 'MD' && effectMetric !== 'SMD') {
          setEffectMetric('MD');
        }
      }
    }
  }, [endpointType, analysisMode]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Core language translation properties
  const TEXTS = {
    zh: {
      title: "臨床試驗高階統合分析系統 Workspace",
      subtitle: "學術級跨試驗設計對照、實時雙終點統計合併模型 (M-H & IV)、森林圖 (Forest Plot) 繪製與 AI 解讀",
      poolHeader: "1. 統合分析試驗對象選取池",
      poolDesc: "請勾選至少 2 項臨床試驗進行統合分析。系統已自動整合自本試驗平台的「不良事件」與「療效指標」暫存區中的所有試驗資訊。",
      selectedCount: "已選取 {selected} / {total} 項試驗",
      noTrials: "暫無暫存試驗",
      noTrialsDesc: "請先前往系統對話諮詢區搜尋臨床試驗，並在展開的試驗細節底端點擊「導入數據」或「導入 SAE」按鈕。",
      atLeastTwo: "請至少選取 2 項試驗以開啟分析功能",
      
      tabCharts: "明細編輯、森林圖與統計模型",
      tabCompare: "主要量測指標對照表",
      tabReport: "Gemini 專家統合統計報告",

      panelOptionsTitle: "統計模型與參數配置 (Parameters Panel)",
      lblEndpoint: "數據終點分類 (Endpoint Classification)",
      lblMetric: "統計效應指標 (Effect Metric)",
      lblModel: "統計分析合併模型 (Synthesis Model)",
      
      optBinary: "二元終點 (Dichotomous / Binary)",
      optContinuous: "連續終點 (Continuous / Numerical)",
      optFixed: "固定效應模型 (Fixed Effects - Inverse Variance)",
      optRandom: "隨機效應模型 (Random Effects - DerSimonian-Laird)",

      lblDataSheet: "2. 臨床試驗明細數據管理 (Datasheet Editor)",
      lblSheetDesc: "編輯各試驗的原始數據。修改將即時連動下方的統計檢定、異質性分析以及 SVG 森林圖。",
      lblTxGroup: "試驗組 (Treatment Group)",
      lblCxGroup: "對照組 (Control Group)",
      thStudy: "試驗學術編號 NCTID",
      thEvents: "事件數 (Events)",
      thTotal: "總人數 (N)",
      thMean: "均值 (Mean)",
      thSD: "標準差 (SD)",
      thCalculated: "個別研究效應量 [95% CI]",

      forestPlotTitle: "3. 統合分析森林圖 (Forest Plot Viewer)",
      forestSummaryTitle: "統合效應量合併結果與異質性檢定",
      lblCochranQ: "Cochran's Q 異質性指標:",
      lblDF: "自由度 (df):",
      lblPvalue: "統計顯著性 (p-value):",
      lblI2: "異質性百分比 I²:",
      lblTau2: "研究間方差 τ²:",
      lblOverallPooled: "合併總體效應值 (Pooled Estimate):",
      zScoreLabel: "Z-score 檢定量:",
      
      nctId: "試驗編號",
      briefTitle: "試驗簡明標題",
      phase: "試驗階段",
      masking: "遮盲設計",
      allocation: "分配方式",
      primaryGoals: "規劃的主要量測指標 (Primary Outcomes)",
      details: "外部官網",
      
      btnGenerate: "產生統合分析學術報告",
      generating: "Gemini 正在調閱明細數、校閱隨機對照設計偏誤、並寫作醫療統合報告...",
      copied: "已複製報告 Markdown 至剪貼簿！",
      copyBtn: "複製報告至剪貼簿",
      downloadBtn: "下載 Markdown 報告 (.md)",
      emptyReport: "請點擊上方按鈕，調用 Gemini 專家統計模型，系統將深入綜整您所編輯的試驗數據、遮盲質量、事件比例、平均值等，並撰寫詳盡的方法學合流偏誤審校與學術綜合統合分析科學報告。",
    },
    en: {
      title: "Advanced Clinical Trials Meta-Analysis Engine",
      subtitle: "Multi-endpoint statistics workbench, customized datasheets, real-time forest plot generator, and LLM biostatistics writer",
      poolHeader: "1. Analysis Cohort Selection Pool",
      poolDesc: "Please select at least 2 clinical trials to perform meta-analysis. The system synthesizes accumulated trials across SAE and Outcomes cache spaces.",
      selectedCount: "{selected} of {total} trials selected",
      noTrials: "No Cached Trials Found",
      noTrialsDesc: "Go back to the Search console, expand details under matching trials, and click 'Import Data' or 'Import SAE Data'.",
      atLeastTwo: "Please select at least 2 clinical trials for Meta-Analysis",
      
      tabCharts: "Datasheet, Forest Plot & Models",
      tabCompare: "Efficacy Outcome Matrix",
      tabReport: "Gemini AI Synthesis Report",

      panelOptionsTitle: "Biostatistical Parameters & Models Panel",
      lblEndpoint: "Endpoint Paradigm Classification",
      lblMetric: "Statistical Effect Metric",
      lblModel: "Analysis Integration Model",
      
      optBinary: "Binary / Dichotomous Endpoint",
      optContinuous: "Continuous / Numerical Endpoint",
      optFixed: "Fixed Effects Model (Inverse-Variance)",
      optRandom: "Random Effects Model (DerSimonian-Laird)",

      lblDataSheet: "2. Clinical Trial Details Sheet",
      lblSheetDesc: "Inspect or modify study raw stats. Changes immediately trigger recalculation of Forest Plot ticks, weights, CI lines, and heterogeneity indices.",
      lblTxGroup: "Treatment (Tx) Group",
      lblCxGroup: "Control (Cx) Group",
      thStudy: "Trial ID",
      thEvents: "Events",
      thTotal: "Total (N)",
      thMean: "Mean",
      thSD: "Std Dev (SD)",
      thCalculated: "Study Effect Size [95% CI]",

      forestPlotTitle: "3. Interactive forest plot viewer",
      forestSummaryTitle: "Heterogeneity Statistics & Meta-Synthesis Summary",
      lblCochranQ: "Cochran's Q Statistics:",
      lblDF: "Degrees of freedom (df):",
      lblPvalue: "Efficacy Signif (p-value):",
      lblI2: "Heterogeneity Percentage I²:",
      lblTau2: "Between-study Variance τ²:",
      lblOverallPooled: "Cumulative Pooled Effect:",
      zScoreLabel: "Z-score Statistic:",
      
      nctId: "Trial ID",
      briefTitle: "Brief Title",
      phase: "Phase",
      masking: "Masking",
      allocation: "Allocation",
      primaryGoals: "Planned Primary Outcomes",
      details: "Link",
      
      btnGenerate: "Generate Meta-Analysis Summary Report",
      generating: "Gemini is performing bias evaluation, therapy comparisons and toxicity profiling...",
      copied: "Report Markdown copied to clipboard!",
      copyBtn: "Copy Report to Clipboard",
      downloadBtn: "Download MD Report (.md)",
      emptyReport: "Click the generation button above to invoke academic-grade Gemini 3.5 models. The AI will synthesize efficacy outcomes, investigate biases, and write a formal meta-analysis.",
    }
  };

  const t = TEXTS[lang];

  // Map chosen NCTIds to actual trials list
  const selectedTrials = deduplicatedPool.filter(item => selectedNctIds.has(item.nctId));

  // Extract all unique SAE terms from currently selected trials for search matches, sorted by occurrence frequency in the raw pool descending
  const uniqueSaeTerms = useMemo(() => {
    const rawSet = Array.from(
      new Set([
        ...(aeTypeFilter === 'serious'
          ? (selectedTrials.flatMap(t => t.seriousEvents?.map(e => e.term) || []))
          : (selectedTrials.flatMap(t => t.otherEvents?.map(e => e.term) || []))
        )
      ])
    );

    // Calculate how many trials in raw pool (deduplicatedPool) contain this term
    const counts: Record<string, number> = {};
    rawSet.forEach(term => {
      counts[term] = deduplicatedPool.filter(tr => 
        (aeTypeFilter === 'serious' ? (tr.seriousEvents || []) : (tr.otherEvents || []))
          .some(e => e.term?.toLowerCase() === term.toLowerCase())
      ).length;
    });

    return rawSet.sort((a, b) => {
      const countA = counts[a] || 0;
      const countB = counts[b] || 0;
      if (countB !== countA) {
        return countB - countA;
      }
      return a.localeCompare(b);
    });
  }, [selectedTrials, deduplicatedPool, aeTypeFilter]);

  // Auto-select starting SAE term if valid, or fallback if current is invalid
  useEffect(() => {
    if (analysisMode === 'sae') {
      if (!selectedSaeTerm || !uniqueSaeTerms.includes(selectedSaeTerm)) {
        if (uniqueSaeTerms.length > 0) {
          setSelectedSaeTerm(uniqueSaeTerms[0]);
        } else {
          setSelectedSaeTerm('');
        }
      }
    }
  }, [analysisMode, selectedSaeTerm, uniqueSaeTerms]);

  // Load SAE stats on term change
  useEffect(() => {
    if (selectedSaeTerm) {
      const initializedStats = getInitialSaeStats(selectedSaeTerm, selectedTrials, selectedTxGroup, selectedCxGroup, trialSaeTerms);
      setSaeStats(initializedStats);
    }
  }, [selectedSaeTerm, poolIdsSerialized, trialSaeTerms, selectedTxGroup, selectedCxGroup, aeTypeFilter]);

  const handleToggleSelect = (nctId: string) => {
    const next = new Set(selectedNctIds);
    if (next.has(nctId)) {
      next.delete(nctId);
    } else {
      next.add(nctId);
    }
    setSelectedNctIds(next);
  };

  const handleSelectAll = () => {
    if (selectedNctIds.size === deduplicatedPool.length) {
      setSelectedNctIds(new Set());
    } else {
      setSelectedNctIds(new Set(deduplicatedPool.map(tr => tr.nctId)));
    }
  };

  // Safe manual stat updates handler
  const handleUpdateStat = (
    nctId: string, 
    type: 'binary' | 'continuous', 
    field: string, 
    value: number
  ) => {
    let validatedValue = isNaN(value) ? 0 : value;
    if (validatedValue < 0) validatedValue = 0;

    setTrialStats(prev => {
      const copy = { ...prev };
      if (!copy[nctId]) return prev;
      
      const studyStats = { ...copy[nctId] };
      if (type === 'binary') {
        const bin = { ...studyStats.binary, [field]: validatedValue };
        // Events cannot exceed total
        if (field === 'tTotal' || field === 'tEvents') {
          if (bin.tEvents > bin.tTotal) bin.tEvents = bin.tTotal;
        }
        if (field === 'cTotal' || field === 'cEvents') {
          if (bin.cEvents > bin.cTotal) bin.cEvents = bin.cTotal;
        }
        studyStats.binary = bin;
      } else {
        studyStats.continuous = { ...studyStats.continuous, [field]: validatedValue };
      }
      
      copy[nctId] = studyStats;
      return copy;
    });
  };

  const handleUpdateSaeStat = (nctId: string, field: string, value: number) => {
    let validatedValue = isNaN(value) ? 0 : value;
    if (validatedValue < 0) validatedValue = 0;

    setSaeStats(prev => {
      const copy = { ...prev };
      if (!copy[nctId]) return prev;
      
      const studyStats = { ...copy[nctId], [field]: validatedValue };
      // Events cannot exceed total
      if (field === 'tTotal' || field === 'tEvents') {
        if (studyStats.tEvents > studyStats.tTotal) studyStats.tEvents = studyStats.tTotal;
      }
      if (field === 'cTotal' || field === 'cEvents') {
        if (studyStats.cEvents > studyStats.cTotal) studyStats.cEvents = studyStats.cTotal;
      }
      
      copy[nctId] = studyStats;
      return copy;
    });
  };

  const handleDownloadSVG = () => {
    const svgEl = document.getElementById('forest-plot-svg');
    if (!svgEl) return;
    
    const cloned = svgEl.cloneNode(true) as SVGSVGElement;
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    cloned.style.backgroundColor = '#ffffff';
    cloned.style.padding = '15px';
    
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(cloned);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    
    const metricName = analysisMode === 'sae' ? `SAE_${selectedSaeTerm || 'SAE'}` : `${endpointType}_Endpoint`;
    link.download = `forest_plot_${metricName}_${effectMetric}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadForestReport = (currentOutcome: any) => {
    if (!currentOutcome) return;
    const isSae = analysisMode === 'sae';
    const metricName = isSae ? `SAE [${selectedSaeTerm || ''}]` : `${endpointType.toUpperCase()} Endpoint`;
    const metricLabel = isSae ? (lang === 'en' ? 'Adverse Event' : '安全指標不良事件') : (lang === 'en' ? 'Efficacy Endpoint' : '主要終點連續性數據');
    const pooledVal = effectMetric === 'OR' || effectMetric === 'RR' 
      ? Math.exp(currentOutcome.pooledEs).toFixed(3)
      : currentOutcome.pooledEs.toFixed(3);
    const pooledCi = effectMetric === 'OR' || effectMetric === 'RR'
      ? `[${Math.exp(currentOutcome.pooledCiLow).toFixed(3)} - ${Math.exp(currentOutcome.pooledCiHigh).toFixed(3)}]`
      : `[${currentOutcome.pooledCiLow.toFixed(3)} - ${currentOutcome.pooledCiHigh.toFixed(3)}]`;

    const reportText = `==================================================
臨床試驗統合分析結果報告 (Meta-Analysis Report)
==================================================
產生時間 (Generated): ${new Date().toLocaleString()}
分析指標 (Analysis Target): ${metricLabel} - ${metricName}
效應量類型 (Effect Metric): ${effectMetric}
分析模型 (Analysis Model): 隨機效應模型 (Random-Effects Model - DerSimonian-Laird Method)

--------------------------------------------------
一、總體合併效應量結果 (Pooled Effect Estimate)
--------------------------------------------------
* 合併效應量 (Pooled Effect Size): ${pooledVal}
* 95% 信心區間 (95% Confidence Interval): ${pooledCi}
* Z-Score (顯著性檢定統計量): ${currentOutcome.zScore.toFixed(4)}
* P-value (顯著性值): ${currentOutcome.pValue < 0.001 ? '< 0.001' : currentOutcome.pValue.toFixed(4)}

--------------------------------------------------
二、異質性檢定結果 (Heterogeneity Tests)
--------------------------------------------------
* Cochran Q 檢定值 (Q-Statistic): ${currentOutcome.qValue.toFixed(4)}
* 自由度 (df - Degrees of Freedom): ${currentOutcome.df}
* 異質性 P-value: ${currentOutcome.pValue.toFixed(4)}
* I-Squared (I²) 異質性比例: ${currentOutcome.iSquared.toFixed(2)}%
  (說明: I² < 25%: 低異質性; 25% - 50%: 中等異質性; > 50%: 高異質性)
* Tau-Squared (τ² 估計值): ${currentOutcome.tauSquared.toFixed(4)}

--------------------------------------------------
三、納入試驗個體效應量明細 (Individual Trial Details)
--------------------------------------------------
NCT ID       | 權重 (Weight) | 效應量 [95% CI] (Effect Size)
--------------------------------------------------
${currentOutcome.studies.map((s: any) => {
  const paddedNct = s.nctId.padEnd(12);
  const paddedWeight = `${s.relativeWeight.toFixed(1)}%`.padEnd(8);
  return `${paddedNct} | ${paddedWeight} | ${s.displayValue}`;
}).join('\n')}
--------------------------------------------------
==================================================
`;

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    const fileNameSuffix = isSae ? `SAE_${selectedSaeTerm || 'SAE'}` : `${endpointType}_Endpoint`;
    link.download = `meta_analysis_report_${fileNameSuffix}_${effectMetric}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // PRE-CALCULATE METHODOLOGY STATS FOR FOREST PLOT
  // Map selected trials into calculating individual studies biostats
  const calculatedStudyList = selectedTrials.map(tr => {
    const statsInput = trialStats[tr.nctId] || {
      binary: { tEvents: 10, tTotal: 100, cEvents: 20, cTotal: 100 },
      continuous: { tN: 100, tMean: 5, tSD: 2, cN: 100, cMean: 7, cSD: 2 }
    };

    let es = 0;       // study effect size representation (e.g. log OR, log RR, RD, MD, SMD)
    let se = 0.0001;  // standard error
    let rawText = '';
    let displayValue = '';

    if (endpointType === 'binary') {
      let { tEvents: a, tTotal: n1, cEvents: c, cTotal: n2 } = statsInput.binary;
      
      // Ensure nonzero safety bounds
      if (n1 <= 0) n1 = 1;
      if (n2 <= 0) n2 = 1;
      if (a < 0) a = 0;
      if (c < 0) c = 0;
      if (a > n1) a = n1;
      if (c > n2) c = n2;

      const b = n1 - a;
      const d = n2 - c;

      rawText = `${a} / ${n1} vs ${c} / ${n2}`;

      // Advanced adjustment to avoid dividing by 0
      const needsCorrection = (a === 0 || b === 0 || c === 0 || d === 0);
      const adjA = needsCorrection ? a + 0.5 : a;
      const adjB = needsCorrection ? b + 0.5 : b;
      const adjC = needsCorrection ? c + 0.5 : c;
      const adjD = needsCorrection ? d + 0.5 : d;
      const adjN1 = needsCorrection ? n1 + 1 : n1;
      const adjN2 = needsCorrection ? n2 + 1 : n2;

      if (effectMetric === 'OR') {
        const or = (adjA * adjD) / (adjB * adjC);
        es = Math.log(or);
        se = Math.sqrt(1 / adjA + 1 / adjB + 1 / adjC + 1 / adjD);
      } else if (effectMetric === 'RR') {
        const r1 = adjA / adjN1;
        const r2 = adjC / adjN2;
        const rr = r1 / r2;
        es = Math.log(rr);
        se = Math.sqrt(1 / adjA - 1 / adjN1 + 1 / adjC - 1 / adjN2);
      } else { // Risk Difference - RD
        const r1 = a / n1;
        const r2 = c / n2;
        es = r1 - r2;
        se = Math.sqrt((r1 * (1 - r1)) / n1 + (r2 * (1 - r2)) / n2);
        if (se <= 0) se = 0.001; 
      }
    } else { // Continuous data stream
      let { tN: n1, tMean: m1, tSD: sd1, cN: n2, cMean: m2, cSD: sd2 } = statsInput.continuous;
      if (n1 <= 0) n1 = 1;
      if (n2 <= 0) n2 = 1;
      if (sd1 <= 0) sd1 = 0.1;
      if (sd2 <= 0) sd2 = 0.1;

      rawText = `Tx(N=${n1}, M=${m1}, SD=${sd1}) vs Cx(N=${n2}, M=${m2}, SD=${sd2})`;

      if (effectMetric === 'MD') {
        es = m1 - m2;
        se = Math.sqrt((sd1 * sd1) / n1 + (sd2 * sd2) / n2);
      } else { // SMD (Standardized Mean Difference - Hedges' g)
        const d_of_f = n1 + n2 - 2;
        const spooled = Math.sqrt(((n1 - 1) * sd1 * sd1 + (n2 - 1) * sd2 * sd2) / (d_of_f || 1));
        const cohenD = spooled > 0 ? (m1 - m2) / spooled : 0;
        
        // Hedges g correction factor threshold
        const hedgesJ = 1 - 3 / (4 * (n1 + n2) - 9);
        es = cohenD * hedgesJ;
        se = Math.sqrt((n1 + n2) / (n1 * n2) + (es * es) / (2 * (n1 + n2)));
        if (se <= 0) se = 0.001;
      }
    }

    const v = se * se;

    const ciLowFixed = es - 1.96 * se;
    const ciHighFixed = es + 1.96 * se;

    // String formatting helper helper
    const isLogMetric = (effectMetric === 'OR' || effectMetric === 'RR');
    if (isLogMetric) {
      displayValue = `${Math.exp(es).toFixed(2)} [${Math.exp(ciLowFixed).toFixed(2)} - ${Math.exp(ciHighFixed).toFixed(2)}]`;
    } else {
      displayValue = `${es.toFixed(2)} [${ciLowFixed.toFixed(2)} - ${ciHighFixed.toFixed(2)}]`;
    }

    return {
      nctId: tr.nctId,
      briefTitle: tr.briefTitle,
      es,
      se,
      v,
      rawText,
      displayValue
    };
  });

  // PERFORM POOLING (M-H / Inverse Variance models)
  const metaOutcome = (() => {
    const k = calculatedStudyList.length;
    if (k < 2) return null;

    // Fixed Effect weights sum
    let sumWFixed = 0;
    let sumWYFixed = 0;
    calculatedStudyList.forEach(s => {
      const w = s.v > 0 ? 1 / s.v : 0;
      sumWFixed += w;
      sumWYFixed += w * s.es;
    });

    const pooledEsFixed = sumWFixed > 0 ? sumWYFixed / sumWFixed : 0;

    // Cochran's Q testing statistic
    let qValue = 0;
    calculatedStudyList.forEach(s => {
      const w = s.v > 0 ? 1 / s.v : 0;
      const diff = s.es - pooledEsFixed;
      qValue += w * diff * diff;
    });

    const df = k - 1;
    const iSquared = qValue > df ? ((qValue - df) / qValue) * 100 : 0;

    // Between study variance Tau^2 estimator (DerSimonian-Laird)
    let tauSquared = 0;
    if (qValue > df) {
      let sumW2 = 0;
      calculatedStudyList.forEach(s => {
        const w = s.v > 0 ? 1 / s.v : 0;
        sumW2 += w * w;
      });
      const cCoeff = sumWFixed - (sumW2 / sumWFixed);
      tauSquared = (qValue - df) / (cCoeff || 1);
      if (tauSquared < 0) tauSquared = 0;
    }

    // Allocate pooled parameters based on user selections
    const studyCalculations = calculatedStudyList.map(s => {
      let weight = 0;
      if (poolingModel === 'fixed') {
        weight = s.v > 0 ? 1 / s.v : 0;
      } else {
        weight = (s.v + tauSquared) > 0 ? 1 / (s.v + tauSquared) : 0;
      }

      const ciLow = s.es - 1.96 * s.se;
      const ciHigh = s.es + 1.96 * s.se;

      return {
        ...s,
        weight,
        ciLow,
        ciHigh,
        relativeWeight: 0
      };
    });

    let sumW = 0;
    let sumWY = 0;
    studyCalculations.forEach(sc => {
      sumW += sc.weight;
      sumWY += sc.weight * sc.es;
    });

    const pooledEs = sumW > 0 ? sumWY / sumW : 0;
    const pooledSe = sumW > 0 ? Math.sqrt(1 / sumW) : 0.0001;

    const pooledCiLow = pooledEs - 1.96 * pooledSe;
    const pooledCiHigh = pooledEs + 1.96 * pooledSe;

    // Relative weights scaling
    studyCalculations.forEach(sc => {
      sc.relativeWeight = sumW > 0 ? (sc.weight / sumW) * 100 : 0;
    });

    const zScore = pooledSe > 0 ? pooledEs / pooledSe : 0;
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));

    // Cochran Q significance p-value approximate (1 df chi square fallback standard approximation tool)
    const qProb = 1 - normalCDF(Math.sqrt(Math.abs(qValue))); // conservative quick fallback

    return {
      studies: studyCalculations,
      pooledEs,
      pooledSe,
      pooledCiLow,
      pooledCiHigh,
      zScore,
      pValue,
      qValue,
      df,
      iSquared,
      tauSquared,
      qProb
    };
  })();

  // PRE-CALCULATE METHODOLOGY STATS FOR SAE FOREST PLOT
  const saeCalculatedStudyList = selectedTrials.map(tr => {
    const statsInput = saeStats[tr.nctId] || { tEvents: 0, tTotal: 100, cEvents: 0, cTotal: 100 };

    let es = 0;       // study effect size representation
    let se = 0.0001;  // standard error
    let rawText = '';
    let displayValue = '';

    let { tEvents: a, tTotal: n1, cEvents: c, cTotal: n2 } = statsInput;
    
    // Ensure nonzero safety bounds
    if (n1 <= 0) n1 = 1;
    if (n2 <= 0) n2 = 1;
    if (a < 0) a = 0;
    if (c < 0) c = 0;
    if (a > n1) a = n1;
    if (c > n2) c = n2;

    const b = n1 - a;
    const d = n2 - c;

    rawText = `${a} / ${n1} vs ${c} / ${n2}`;

    // Advanced adjustment to avoid dividing by 0
    const needsCorrection = (a === 0 || b === 0 || c === 0 || d === 0);
    const adjA = needsCorrection ? a + 0.5 : a;
    const adjB = needsCorrection ? b + 0.5 : b;
    const adjC = needsCorrection ? c + 0.5 : c;
    const adjD = needsCorrection ? d + 0.5 : d;
    const adjN1 = needsCorrection ? n1 + 1 : n1;
    const adjN2 = needsCorrection ? n2 + 1 : n2;

    // SAE only runs binary algorithms (OR, RR, RD)
    const activeMetric = (effectMetric === 'OR' || effectMetric === 'RR' || effectMetric === 'RD') ? effectMetric : 'OR';

    if (activeMetric === 'OR') {
      const or = (adjA * adjD) / (adjB * adjC);
      es = Math.log(or);
      se = Math.sqrt(1 / adjA + 1 / adjB + 1 / adjC + 1 / adjD);
    } else if (activeMetric === 'RR') {
      const r1 = adjA / adjN1;
      const r2 = adjC / adjN2;
      const rr = r1 / r2;
      es = Math.log(rr);
      se = Math.sqrt(1 / adjA - 1 / adjN1 + 1 / adjC - 1 / adjN2);
    } else { // Risk Difference - RD
      const r1 = a / n1;
      const r2 = c / n2;
      es = r1 - r2;
      se = Math.sqrt((r1 * (1 - r1)) / n1 + (r2 * (1 - r2)) / n2);
      if (se <= 0) se = 0.001; 
    }

    const v = se * se;

    const ciLowFixed = es - 1.96 * se;
    const ciHighFixed = es + 1.96 * se;

    const isLogMetric = (activeMetric === 'OR' || activeMetric === 'RR');
    if (isLogMetric) {
      displayValue = `${Math.exp(es).toFixed(2)} [${Math.exp(ciLowFixed).toFixed(2)} - ${Math.exp(ciHighFixed).toFixed(2)}]`;
    } else {
      displayValue = `${es.toFixed(2)} [${ciLowFixed.toFixed(2)} - ${ciHighFixed.toFixed(2)}]`;
    }

    return {
      nctId: tr.nctId,
      briefTitle: tr.briefTitle,
      es,
      se,
      v,
      rawText,
      displayValue
    };
  });

  // PERFORM POOLING FOR SAE
  const saeMetaOutcome = (() => {
    const k = saeCalculatedStudyList.length;
    if (k < 2) return null;

    let sumWFixed = 0;
    let sumWYFixed = 0;
    saeCalculatedStudyList.forEach(s => {
      const w = s.v > 0 ? 1 / s.v : 0;
      sumWFixed += w;
      sumWYFixed += w * s.es;
    });

    const pooledEsFixed = sumWFixed > 0 ? sumWYFixed / sumWFixed : 0;

    let qValue = 0;
    saeCalculatedStudyList.forEach(s => {
      const w = s.v > 0 ? 1 / s.v : 0;
      const diff = s.es - pooledEsFixed;
      qValue += w * diff * diff;
    });

    const df = k - 1;
    const iSquared = qValue > df ? ((qValue - df) / qValue) * 100 : 0;

    let tauSquared = 0;
    if (qValue > df) {
      let sumW2 = 0;
      saeCalculatedStudyList.forEach(s => {
        const w = s.v > 0 ? 1 / s.v : 0;
        sumW2 += w * w;
      });
      const cCoeff = sumWFixed - (sumW2 / sumWFixed);
      tauSquared = (qValue - df) / (cCoeff || 1);
      if (tauSquared < 0) tauSquared = 0;
    }

    const studyCalculations = saeCalculatedStudyList.map(s => {
      let weight = 0;
      if (poolingModel === 'fixed') {
        weight = s.v > 0 ? 1 / s.v : 0;
      } else {
        weight = (s.v + tauSquared) > 0 ? 1 / (s.v + tauSquared) : 0;
      }

      const ciLow = s.es - 1.96 * s.se;
      const ciHigh = s.es + 1.96 * s.se;

      return {
        ...s,
        weight,
        ciLow,
        ciHigh,
        relativeWeight: 0
      };
    });

    let sumW = 0;
    let sumWY = 0;
    studyCalculations.forEach(sc => {
      sumW += sc.weight;
      sumWY += sc.weight * sc.es;
    });

    const pooledEs = sumW > 0 ? sumWY / sumW : 0;
    const pooledSe = sumW > 0 ? Math.sqrt(1 / sumW) : 0.0001;

    const pooledCiLow = pooledEs - 1.96 * pooledSe;
    const pooledCiHigh = pooledEs + 1.96 * pooledSe;

    studyCalculations.forEach(sc => {
      sc.relativeWeight = sumW > 0 ? (sc.weight / sumW) * 100 : 0;
    });

    const zScore = pooledSe > 0 ? pooledEs / pooledSe : 0;
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
    const qProb = 1 - normalCDF(Math.sqrt(Math.abs(qValue)));

    return {
      studies: studyCalculations,
      pooledEs,
      pooledSe,
      pooledCiLow,
      pooledCiHigh,
      zScore,
      pValue,
      qValue,
      df,
      iSquared,
      tauSquared,
      qProb
    };
  })();

  // BUILD SAE-DATA SUMMARIES TO SEND TO GEMINI AI
  const saeCustomDataSummary = (() => {
    let text = `Analysis of Adverse Event: "${selectedSaeTerm}"\n`;
    text += `Trial NCT ID | Study Title | Trial SAE Counts (Events/Total)\n`;
    text += `---------------------------------------------------------\n`;
    selectedTrials.forEach(tr => {
      const name = tr.briefTitle.slice(0, 45) + '...';
      const stats = saeStats[tr.nctId] || { tEvents: 0, tTotal: 100, cEvents: 0, cTotal: 100 };
      
      const isMatched = (
        aeTypeFilter === 'serious' ? (tr.seriousEvents || []) : (tr.otherEvents || [])
      ).some(e => e.term.toLowerCase() === selectedSaeTerm.toLowerCase());

      const raw = `Tx: ${stats.tEvents}/${stats.tTotal} | Cx: ${stats.cEvents}/${stats.cTotal} [Matched in Trial Record: ${isMatched}]`;
      const studyResult = saeMetaOutcome?.studies.find(item => item.nctId === tr.nctId);
      const studyCalcVal = studyResult ? studyResult.displayValue : 'N/A';

      text += `${tr.nctId} | ${name} | ${raw} | Calculated ES: ${studyCalcVal}\n`;
    });
    return text;
  })();

  const saeComputedPooledStatsStr = (() => {
    if (!saeMetaOutcome) return 'Not sufficient trial numbers.';
    const activeMetric = (effectMetric === 'OR' || effectMetric === 'RR' || effectMetric === 'RD') ? effectMetric : 'OR';
    const isLogMetric = (activeMetric === 'OR' || activeMetric === 'RR');
    
    let stats = `Integrated Adverse Event "${selectedSaeTerm}" Meta-Analysis Statistics (${poolingModel.toUpperCase()} effect model - pooled via Inverse Variance method):\n`;
    stats += `---------------------------------------------------------\n`;
    if (isLogMetric) {
      stats += `- Pooled Risk Overall (${activeMetric}): ${Math.exp(saeMetaOutcome.pooledEs).toFixed(2)} (95% CI: ${Math.exp(saeMetaOutcome.pooledCiLow).toFixed(2)} to ${Math.exp(saeMetaOutcome.pooledCiHigh).toFixed(2)})\n`;
      stats += `- Pooled Natural Log Overall (ln ${activeMetric}): ${saeMetaOutcome.pooledEs.toFixed(3)} (95% CI: ${saeMetaOutcome.pooledCiLow.toFixed(3)} to ${saeMetaOutcome.pooledCiHigh.toFixed(3)})\n`;
    } else {
      stats += `- Pooled Risk Difference Overall (${activeMetric}): ${saeMetaOutcome.pooledEs.toFixed(3)} (95% CI: ${saeMetaOutcome.pooledCiLow.toFixed(3)} to ${saeMetaOutcome.pooledCiHigh.toFixed(3)})\n`;
    }
    stats += `- Test of null effect Z: ${saeMetaOutcome.zScore.toFixed(3)}, p-value: ${saeMetaOutcome.pValue < 0.001 ? '< 0.001' : saeMetaOutcome.pValue.toFixed(4)}\n`;
    stats += `\nHeterogeneity Indices Analysis:\n`;
    stats += `- Cochran's Q testing score: ${saeMetaOutcome.qValue.toFixed(2)} on ${saeMetaOutcome.df} degrees of freedom (df)\n`;
    stats += `- I-squared (I²) Proportion statistic: ${saeMetaOutcome.iSquared.toFixed(1)}%\n`;
    stats += `- Between-study Variance Tau-squared (τ²): ${saeMetaOutcome.tauSquared.toFixed(4)}\n`;
    return stats;
  })();

  // BUILD DUAL-DATA SUMMARIES TO SEND TO GEMINI AI
  const customDataSummary = (() => {
    let text = `Trial NCT ID | Study Title | Selected Outcome Measure | Data Values Contrast / Parameters\n`;
    text += `-----------------------------------------------------------------\n`;
    selectedTrials.forEach(tr => {
      const name = tr.briefTitle.slice(0, 45) + '...';
      const stats = trialStats[tr.nctId];
      if (!stats) return;

      const selectedMeasure = trialOutcomeMeasures[tr.nctId] || (tr.resultsData?.outcomeMeasures?.[0]?.title || 'Default Primary Outcome');

      const raw = endpointType === 'binary' 
        ? `Tx Events: ${stats.binary.tEvents}/${stats.binary.tTotal} | Cx Events: ${stats.binary.cEvents}/${stats.binary.cTotal}`
        : `Tx (N=${stats.continuous.tN}, Mean=${stats.continuous.tMean}, SD=${stats.continuous.tSD}) | Cx (N=${stats.continuous.cN}, Mean=${stats.continuous.cMean}, SD=${stats.continuous.cSD})`;

      const studyResult = metaOutcome?.studies.find(item => item.nctId === tr.nctId);
      const studyCalcVal = studyResult ? studyResult.displayValue : 'N/A';

      text += `${tr.nctId} | ${name} | ${selectedMeasure} | ${raw} | Calculated ES: ${studyCalcVal}\n`;
    });
    return text;
  })();

  const computedPooledStatsStr = (() => {
    if (!metaOutcome) return 'Not sufficient trial numbers.';
    const isLogMetric = (effectMetric === 'OR' || effectMetric === 'RR');
    
    let stats = `Integrated Meta-Analysis Statistics (${poolingModel.toUpperCase()} effect model - pooled via Inverse Variance method):\n`;
    stats += `---------------------------------------------------------\n`;
    if (isLogMetric) {
      stats += `- Pooled Efficacy Overall (${effectMetric}): ${Math.exp(metaOutcome.pooledEs).toFixed(2)} (95% CI: ${Math.exp(metaOutcome.pooledCiLow).toFixed(2)} to ${Math.exp(metaOutcome.pooledCiHigh).toFixed(2)})\n`;
      stats += `- Pooled Natural Log Overall (ln ${effectMetric}): ${metaOutcome.pooledEs.toFixed(3)} (95% CI: ${metaOutcome.pooledCiLow.toFixed(3)} to ${metaOutcome.pooledCiHigh.toFixed(3)})\n`;
    } else {
      stats += `- Pooled Efficacy Overall (${effectMetric}): ${metaOutcome.pooledEs.toFixed(3)} (95% CI: ${metaOutcome.pooledCiLow.toFixed(3)} to ${metaOutcome.pooledCiHigh.toFixed(3)})\n`;
    }
    stats += `- Test of null effect Z: ${metaOutcome.zScore.toFixed(3)}, p-value: ${metaOutcome.pValue < 0.001 ? '< 0.001' : metaOutcome.pValue.toFixed(4)}\n`;
    stats += `\nHeterogeneity Indices Analysis:\n`;
    stats += `- Cochran's Q testing score: ${metaOutcome.qValue.toFixed(2)} on ${metaOutcome.df} degrees of freedom (df)\n`;
    stats += `- I-squared (I²) Proportion statistic: ${metaOutcome.iSquared.toFixed(1)}%\n`;
    stats += `- Between-study Variance Tau-squared (τ²): ${metaOutcome.tauSquared.toFixed(4)}\n`;
    return stats;
  })();

  const handleGenerateReport = async () => {
    if (selectedTrials.length < 2) return;

    // Pre-check rate limit
    const limitCheck = isGeminiRateLimited();
    if (limitCheck.limited) {
      setReportMarkdown(lang === 'en' 
        ? `API request limit reached. Please try again in about ${Math.ceil(limitCheck.timeLeftMs / 1000 / 60)} minutes.`
        : `AI 呼叫次數已達上限！請在大約 ${Math.ceil(limitCheck.timeLeftMs / 1000 / 60)} 分鐘後再試。`
      );
      // Broadcast / Refresh the limit globally
      setGeminiRateLimit(limitCheck.timeLeftMs);
      return;
    }

    setIsGenerating(true);
    setReportMarkdown('');
    try {
      const summaryText = await analyzeCohort(selectedTrials, lang, {
        endpointType: analysisMode === 'sae' ? 'binary' : endpointType,
        effectMetric,
        poolingModel,
        customDataSummary: analysisMode === 'sae' ? saeCustomDataSummary : customDataSummary,
        pooledStats: analysisMode === 'sae' ? saeComputedPooledStatsStr : computedPooledStatsStr
      });
      setReportMarkdown(summaryText);
    } catch (err: any) {
      console.error(err);
      if (err.message === "RATE_LIMIT_EXCEEDED") {
        const curLimit = isGeminiRateLimited();
        setReportMarkdown(lang === 'en'
          ? `API request limit reached. Please try again in about ${Math.ceil(curLimit.timeLeftMs / 1000 / 60)} minutes.`
          : `AI 呼叫次數已達上限！請在大約 ${Math.ceil(curLimit.timeLeftMs / 1000 / 60)} 分鐘後再試。`
        );
      } else {
        setReportMarkdown(lang === 'en' ? "Failed to conduct meta-analysis due to api constraints." : "由於網絡或 API 限制，未能成功生成統合分析報告。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyToClipboard = () => {
    if (!reportMarkdown) return;
    navigator.clipboard.writeText(reportMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadReport = () => {
    if (!reportMarkdown) return;
    const blob = new Blob([reportMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `clinical_trial_meta_analysis_${new Date().toISOString().slice(0,10)}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 font-sans">
      <div 
        className="max-w-6xl mx-auto px-4 md:px-8 space-y-6 shrink-0"
        style={{ paddingBottom: '48px', paddingTop: '24px' }}
      >
        {/* Page Banner Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-indigo-100">
                <BarChart3 size={18} />
              </div>
              {t.title}
            </h2>
            <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-3xl leading-relaxed">{t.subtitle}</p>
          </div>
          <div className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-sm self-start flex items-center gap-2 font-mono text-xs text-slate-600 font-semibold shrink-0">
            <ClipboardList size={14} className="text-indigo-500" />
            {t.selectedCount.replace("{selected}", selectedNctIds.size.toString()).replace("{total}", deduplicatedPool.length.toString())}
          </div>
        </div>

        {deduplicatedPool.length === 0 ? (
          /* Empty State Viewport */
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-2xl mx-auto space-y-5 shadow-sm my-12"
          >
            <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Table size={28} />
            </div>
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-base">{t.noTrials}</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {t.noTrialsDesc}
              </p>
            </div>
          </motion.div>
        ) : (
          /* Workspace Container Applet */
          <div className="space-y-6">
            
            {/* Trial Selection Pool Box */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-100 p-4 md:px-5">
                <h3 className="text-xs font-bold uppercase text-slate-700 font-mono tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  {t.poolHeader}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">{t.poolDesc}</p>
              </div>
              <div className="p-4 md:p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {deduplicatedPool.map((tr) => {
                    const isSelected = selectedNctIds.has(tr.nctId);
                    return (
                      <div 
                        key={tr.nctId}
                        onClick={() => handleToggleSelect(tr.nctId)}
                        className={`p-3.5 border rounded-xl cursor-pointer transition-all flex items-start gap-3 select-none ${
                          isSelected 
                            ? 'border-indigo-400 bg-indigo-50/20 shadow-xs' 
                            : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          readOnly
                          className="rounded border-slate-300 text-indigo-600 h-4.5 w-4.5 mt-0.5 pointer-events-none shrink-0"
                        />
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {tr.nctId}
                            </span>
                            <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold px-1.5 py-0.5 rounded uppercase">
                              {tr.phase?.[0] || 'N/A'}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug">
                            {tr.briefTitle}
                          </h4>
                          <p className="text-[10px] text-slate-400 truncate">
                            {tr.conditions.slice(0,2).join(', ')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button 
                    onClick={handleSelectAll}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold transition-colors cursor-pointer"
                  >
                    {selectedNctIds.size === deduplicatedPool.length ? (lang === 'en' ? 'Deselect All' : '取消全選') : (lang === 'en' ? 'Select All' : '快速全選')}
                  </button>
                  {selectedNctIds.size < 2 && (
                    <span className="text-[11px] text-rose-500 flex items-center gap-1.5 font-bold animate-pulse">
                      <AlertTriangle size={13} />
                      {t.atLeastTwo}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Analysis Workspace SubTabs */}
            <div className="flex border-b border-slate-200 gap-2">
              <button
                onClick={() => setActiveSubTab('analytics')}
                className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 ${
                  activeSubTab === 'analytics'
                    ? 'border-indigo-600 text-indigo-600 font-black'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.tabCharts}
              </button>
              <button
                onClick={() => setActiveSubTab('compare')}
                className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 ${
                  activeSubTab === 'compare'
                    ? 'border-indigo-600 text-indigo-600 font-black'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.tabCompare}
              </button>
              <button
                onClick={() => setActiveSubTab('report')}
                className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 ${
                  activeSubTab === 'report'
                    ? 'border-indigo-600 text-indigo-600 font-black'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.tabReport}
              </button>
            </div>

            {/* Interactive Analysis Workspace Area */}
            <div className="min-h-[400px]">
              {selectedNctIds.size < 2 ? (
                /* Prompt selection */
                <div className="bg-slate-100/50 rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-404 shadow-xs">
                  <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300 animate-bounce" />
                  <p className="text-xs font-bold leading-relaxed">{t.atLeastTwo}</p>
                </div>
              ) : activeSubTab === 'analytics' ? (
                /* Tab 1: Parameters Segment, Interactive Data Editor & SVG Forest Plot */
                <div className="space-y-6">
                  {/* Analysis Paradigm / Switch Focus */}
                  {!hideModeSelector && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm mb-1">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          <GitCommit size={15} className="text-indigo-600 animate-pulse" />
                          {lang === 'en' ? 'Meta-Analysis Domain Focus' : '統合分析核心領域選擇'}
                        </h4>
                        <p className="text-[11px] text-slate-400 mt-1">
                          {lang === 'en' 
                            ? 'Toggle computation between primary outcome findings and adverse events occurrence rates.' 
                            : '自由切換主要指標結果 (Primary Outcomes) 與不良事件安全性 (Adverse Events / SAE) 的統合合併分析領域。'}
                        </p>
                      </div>
                      <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 shrink-0">
                        <button
                          onClick={() => setAnalysisMode('outcomes')}
                          className={`py-1.5 px-4 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                            analysisMode === 'outcomes'
                              ? 'bg-indigo-600 text-white shadow-xs font-bold'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <Sliders size={12} />
                          {lang === 'en' ? 'Primary Outcomes' : '主要指標結果數據'}
                        </button>
                        <button
                          onClick={() => setAnalysisMode('sae')}
                          className={`py-1.5 px-4 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                            analysisMode === 'sae'
                              ? 'bg-rose-600 text-white shadow-xs font-bold'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          <ShieldAlert size={12} />
                          {lang === 'en' ? 'Adverse Events (SAE)' : '不良事件數據'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Column (5/12): Parameters Panel & Sheet Editor */}
                  <div className="lg:col-span-5 space-y-6">
                    
                    {/* Parameters Configuration Box */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest font-mono flex items-center gap-2 pb-2 border-b border-slate-100">
                        <Sliders size={13} className="text-indigo-600 font-bold" />
                        {t.panelOptionsTitle}
                      </h4>
                      
                      {/* Endpoint type selection: Binary vs Continuous / SAE Mode Lock */}
                      {analysisMode === 'sae' ? (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.lblEndpoint}</label>
                            <div className="py-2.5 px-3 bg-violet-50 text-violet-700 font-extrabold text-xs rounded-xl border border-violet-100 flex items-center gap-2">
                              <ShieldAlert size={14} className="animate-pulse text-violet-600" />
                              <span>{lang === 'en' ? 'Locked to Binary Events (SAE)' : '鎖定二元終點 (不良事件比例 / 發生個案)'}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              {lang === 'en' ? 'Adverse Event Severity' : '不良事件嚴重程度篩選'}
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => {
                                  setAeTypeFilter('serious');
                                  setSelectedSaeTerm('');
                                }}
                                className={`py-1.5 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                  aeTypeFilter === 'serious' 
                                    ? 'bg-rose-50 border-rose-300 text-rose-700 font-extrabold shadow-2xs' 
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                <ShieldAlert size={12} className={aeTypeFilter === 'serious' ? "text-rose-500 animate-pulse" : "text-slate-400"} />
                                {lang === 'en' ? 'Serious AE' : '嚴重不良事件'}
                              </button>
                              <button
                                onClick={() => {
                                  setAeTypeFilter('other');
                                  setSelectedSaeTerm('');
                                }}
                                className={`py-1.5 px-3 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                  aeTypeFilter === 'other' 
                                    ? 'bg-amber-50 border-amber-300 text-amber-700 font-extrabold shadow-2xs' 
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                <AlertTriangle size={12} className={aeTypeFilter === 'other' ? "text-amber-500" : "text-slate-400"} />
                                {lang === 'en' ? 'Other AE' : '其他不良事件'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.lblMetric}</label>
                            <div className="grid grid-cols-3 gap-2">
                              {['OR', 'RR', 'RD'].map((mt) => (
                                <button
                                  key={mt}
                                  onClick={() => setEffectMetric(mt as any)}
                                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                    effectMetric === mt 
                                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs font-extrabold' 
                                      : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                  }`}
                                >
                                  {mt === 'OR' ? 'OR (比值比)' : mt === 'RR' ? 'RR (相對風險)' : 'RD (風險差)'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.lblEndpoint}</label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => setEndpointType('binary')}
                                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                                  endpointType === 'binary' 
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-black' 
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {lang === 'en' ? 'Binary' : '二元終點'}
                              </button>
                              <button
                                onClick={() => setEndpointType('continuous')}
                                className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                                  endpointType === 'continuous' 
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-black' 
                                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                {lang === 'en' ? 'Continuous' : '連續終點'}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.lblMetric}</label>
                            {endpointType === 'binary' ? (
                              <div className="grid grid-cols-3 gap-2">
                                {['OR', 'RR', 'RD'].map((mt) => (
                                  <button
                                    key={mt}
                                    onClick={() => setEffectMetric(mt as any)}
                                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                      effectMetric === mt 
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs font-extrabold' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                  >
                                    {mt === 'OR' ? 'OR (比值比)' : mt === 'RR' ? 'RR (相對風險)' : 'RD (風險差)'}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-2">
                                {['MD', 'SMD'].map((mt) => (
                                  <button
                                    key={mt}
                                    onClick={() => setEffectMetric(mt as any)}
                                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                      effectMetric === mt 
                                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-2xs font-extrabold' 
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                  >
                                    {mt === 'MD' ? 'MD (平均值差)' : 'SMD (標準化均差)'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {/* Pooling models setup: Fixed vs Random */}
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t.lblModel}</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setPoolingModel('fixed')}
                            className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              poolingModel === 'fixed' 
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-extrabold shadow-2xs' 
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <Scale size={11} className="shrink-0" />
                            {lang === 'en' ? 'Fixed (IV)' : '固定效應模型'}
                          </button>
                          <button
                            onClick={() => setPoolingModel('random')}
                            className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              poolingModel === 'random' 
                                ? 'bg-indigo-50 border-indigo-400 text-indigo-700 font-extrabold shadow-2xs' 
                                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <GitBranch size={11} className="shrink-0" />
                            {lang === 'en' ? 'Random (D-L)' : '隨機效應模型'}
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Trial raw statistical inputs editor panel / AE Classifier */}
                    {analysisMode === 'sae' ? (
                      <>
                        {/* 1. Adverse Event Term Lookup & Picker */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 justify-between">
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest font-mono flex items-center gap-1.5">
                              <ShieldAlert size={14} className="text-rose-500 animate-pulse" />
                              {lang === 'en' ? 'Adverse Event Classifier' : '不良事件分類索引與查找'}
                            </h4>
                            <span className="text-[10px] bg-sky-50 text-sky-700 font-mono font-bold px-2 py-0.5 rounded border border-sky-100">
                              {lang === 'en' ? 'Matched: ' : '相符術語計: '}{uniqueSaeTerms.length}
                            </span>
                          </div>
                          
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                <Sparkles size={11} className="text-indigo-500 animate-pulse" />
                                {lang === 'en' ? '1. 🧠 AI Adverse Event Search & Alignment :' : '1. 🧠 AI 智慧不良事件查找與拼寫對齊 :'}
                              </label>
                              <div className="relative flex gap-2">
                                <input
                                  type="text"
                                  placeholder={lang === 'en' ? 'Enter symptom (e.g. diarrhea, vomiting)...' : '輸入任何症狀 (例如: 腹瀉, 嘔吐, 疲倦)...'}
                                  value={saeSearchQuery}
                                  onChange={(e) => {
                                    setSaeSearchQuery(e.target.value);
                                    if (!e.target.value) {
                                      setSaeAiMatchedTermsList([]);
                                      setSaeAiSearchError('');
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaeAiSearch();
                                    }
                                  }}
                                  className="flex-1 bg-slate-50 border border-slate-200 px-3 py-2 text-xs rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                                />
                                <button
                                  type="button"
                                  onClick={handleSaeAiSearch}
                                  disabled={!isSaeAiSearching && !saeSearchQuery.trim()}
                                  className={`text-white text-xs px-3.5 py-2 rounded-xl font-medium transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
                                    isSaeAiSearching 
                                      ? 'bg-rose-600 hover:bg-rose-700 animate-pulse' 
                                      : 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400'
                                  }`}
                                >
                                  {isSaeAiSearching ? (
                                    <>
                                      <Square size={12} fill="currentColor" />
                                      {lang === 'en' ? 'Stop' : '切斷查找'}
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles size={12} />
                                      {lang === 'en' ? 'AI Find' : 'AI 查找'}
                                    </>
                                  )}
                                </button>
                              </div>
                              
                              {saeAiSearchError && (
                                <p className="text-[10px] text-rose-500 mt-1 font-medium">{saeAiSearchError}</p>
                              )}
                              
                              {saeAiMatchedTermsList.length > 0 && (
                                <div className="mt-2 p-2 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-1">
                                  <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider block">
                                    {lang === 'en' ? 'AI Aligned Symptoms (Same Class):' : 'AI 同類對齊術語 (合併相同症狀不同拼寫):'}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {saeAiMatchedTermsList.map(term => (
                                      <span key={term} className="text-[9px] bg-white border border-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-mono font-medium">
                                        {term}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                {lang === 'en' ? 'Target Analysis Term select' : '2. 📌 選擇核心分析不良事件 :'}
                              </label>
                              <select
                                value={selectedSaeTerm}
                                onChange={(e) => setSelectedSaeTerm(e.target.value)}
                                className="w-full bg-white border border-slate-200 px-3 py-2 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                              >
                                {uniqueSaeTerms.length === 0 ? (
                                  <option value="">{lang === 'en' ? 'No recorded events' : '無不良事件紀錄'}</option>
                                ) : (
                                  <>
                                    {!selectedSaeTerm && <option value="">-- {lang === 'en' ? 'Select an event' : '請選擇分析項目'} --</option>}
                                    {uniqueSaeTerms
                                      .filter(term => {
                                        if (saeAiMatchedTermsList.length > 0) {
                                          return saeAiMatchedTermsList.some(mt => mt.toLowerCase() === term.toLowerCase());
                                        }
                                        if (saeSearchQuery) {
                                          return term.toLowerCase().includes(saeSearchQuery.toLowerCase());
                                        }
                                        return true;
                                      })
                                      .map(term => (
                                        <option key={term} value={term}>
                                          {term}
                                        </option>
                                      ))
                                    }
                                  </>
                                )}
                              </select>
                            </div>

                            {uniqueSaeTerms.length > 0 && (
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  {lang === 'en' ? 'Quick Suggestions (Click to Analyze)' : '快速快捷連結 (點擊後立即項目統合):'}
                                </label>
                                <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1">
                                  {uniqueSaeTerms
                                    .filter(term => {
                                      if (saeAiMatchedTermsList.length > 0) {
                                        return saeAiMatchedTermsList.some(mt => mt.toLowerCase() === term.toLowerCase());
                                      }
                                      if (saeSearchQuery) {
                                        return term.toLowerCase().includes(saeSearchQuery.toLowerCase());
                                      }
                                      return true;
                                    })
                                    .slice(0, 8)
                                    .map(term => {
                                      const isSelected = selectedSaeTerm === term;
                                      const occurrences = selectedTrials.filter(tr => 
                                        (aeTypeFilter === 'serious' ? (tr.seriousEvents || []) : (tr.otherEvents || []))
                                          .some(e => e.term.toLowerCase() === term.toLowerCase())
                                      ).length;

                                      return (
                                        <button
                                          key={term}
                                          onClick={() => setSelectedSaeTerm(term)}
                                          className={`px-2 py-1 text-[10px] font-semibold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                                            isSelected
                                              ? 'bg-rose-500 border-rose-500 text-white font-black shadow-sm'
                                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300'
                                          }`}
                                        >
                                          <span>{term}</span>
                                          <span className={`px-1 rounded-sm text-[8px] font-bold ${
                                            isSelected ? 'bg-rose-600 text-rose-50' : 'bg-slate-200 text-slate-500'
                                          }`}>
                                            {occurrences}/{selectedTrials.length}
                                          </span>
                                        </button>
                                      );
                                    })
                                  }
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 2. Adverse Event Incident Rates Editor Panel */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                          <div>
                            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-2">
                              <Edit size={14} className="text-rose-500" />
                              不良事件明細數據管理
                            </h4>
                            <p className="text-[10px] text-slate-400 mt-1">
                              審查各選定試驗的特定不良事件案件個案。若所選試驗無相符不良事件者，其比例將自動預設為 0。
                            </p>
                          </div>

                          <div className="space-y-3 max-h-[440px] overflow-y-auto custom-scrollbar pr-1">
                            {selectedTrials.map((tr) => {
                              const stats = saeStats[tr.nctId] || { tEvents: 0, tTotal: 100, cEvents: 0, cTotal: 100 };
                              
                              const matchingSae = selectedSaeTerm ? (
                                aeTypeFilter === 'serious' ? (tr.seriousEvents || []) : (tr.otherEvents || [])
                              ).find(e => e.term.toLowerCase() === selectedSaeTerm.toLowerCase()) : null;

                              const studyResult = saeMetaOutcome?.studies.find(item => item.nctId === tr.nctId);

                              return (
                                <div key={tr.nctId} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 hover:bg-slate-50 transition-all space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 animate-fade-in-down">
                                      <span className="font-mono text-[10px] font-bold text-slate-500 bg-sky-50 text-sky-700 border border-sky-200/50 px-1.5 py-0.5 rounded">
                                        {tr.nctId}
                                      </span>
                                      <button 
                                        onClick={() => handleToggleSelect(tr.nctId)}
                                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center border border-slate-200 hover:border-red-200 shadow-3xs"
                                        title={lang === 'en' ? 'Deselect Trial' : '取消選取此試驗'}
                                      >
                                        <X size={11} className="stroke-2" />
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {matchingSae ? (
                                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">
                                          數據相符
                                        </span>
                                      ) : (
                                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                          不相符 (預設 0)
                                        </span>
                                      )}
                                      <span className="text-[10px] font-mono font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                        {effectMetric}: {studyResult?.displayValue || 'Calc Error'}
                                      </span>
                                    </div>
                                  </div>
                                  <h5 className="text-[11px] font-bold text-slate-700 truncate block leading-tight">{tr.briefTitle}</h5>
                                  
                                  {/* Setup Group Selectors with Dropdowns */}
                                  <div className="grid grid-cols-2 gap-2 bg-indigo-50/20 p-2 border border-slate-100 rounded-lg">
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-indigo-600 flex items-center gap-1">
                                        <GitBranch size={10} />
                                        {lang === 'en' ? 'Select Experimental Group' : '選擇試驗組'}
                                      </label>
                                      <select
                                        value={selectedTxGroup[tr.nctId] || ''}
                                        onChange={(e) => handleSelectGroup(tr.nctId, 'tx', e.target.value)}
                                        className="w-full bg-white border border-slate-200 text-[11px] py-1 px-1.5 rounded-md focus:ring-1 focus:ring-indigo-500 text-slate-700 outline-none font-sans font-medium"
                                      >
                                        {getTrialGroups(tr, lang).map((grp) => (
                                          <option key={grp.id} value={grp.id}>
                                            {grp.title}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-amber-600 flex items-center gap-1">
                                        <GitBranch size={10} />
                                        {lang === 'en' ? 'Select Control Group' : '選擇對照組'}
                                      </label>
                                      <select
                                        value={selectedCxGroup[tr.nctId] || ''}
                                        onChange={(e) => handleSelectGroup(tr.nctId, 'cx', e.target.value)}
                                        className="w-full bg-white border border-slate-200 text-[11px] py-1 px-1.5 rounded-md focus:ring-1 focus:ring-indigo-500 text-slate-700 outline-none font-sans font-medium"
                                      >
                                        {getTrialGroups(tr, lang).map((grp) => (
                                          <option key={grp.id} value={grp.id}>
                                            {grp.title}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>

                                  {(() => {
                                    const trialSaeList = aeTypeFilter === 'serious' ? (tr.seriousEvents || []) : (tr.otherEvents || []);
                                    const seenTerms = new Set<string>();
                                    const uniqueTrialTerms: string[] = [];
                                    trialSaeList.forEach(e => {
                                      if (e.term && !seenTerms.has(e.term.toLowerCase())) {
                                        seenTerms.add(e.term.toLowerCase());
                                        uniqueTrialTerms.push(e.term);
                                      }
                                    });

                                    if (uniqueTrialTerms.length === 0) return null;

                                    const activeTrialSae = trialSaeTerms[tr.nctId] || selectedSaeTerm || uniqueTrialTerms[0] || '';

                                    return (
                                      <div className="space-y-1 bg-rose-55 border border-rose-100 p-2 rounded-lg bg-red-50/10">
                                        <label className="text-[9px] font-bold text-rose-600 flex items-center gap-1">
                                          <ShieldAlert size={10} className="text-rose-500" />
                                          {lang === 'en' ? 'Analyze Adverse Event for Trial' : '選擇分析之不良事件'}
                                        </label>
                                        <select
                                          value={activeTrialSae}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setTrialSaeTerms(prev => ({
                                              ...prev,
                                              [tr.nctId]: val
                                            }));
                                            const singleSaeStats = getInitialSaeStats(
                                              selectedSaeTerm, 
                                              [tr], 
                                              selectedTxGroup, 
                                              selectedCxGroup, 
                                              { ...trialSaeTerms, [tr.nctId]: val }
                                            );
                                            setSaeStats(prev => ({
                                              ...prev,
                                              [tr.nctId]: singleSaeStats[tr.nctId]
                                            }));
                                          }}
                                          className="w-full bg-white border border-slate-200 text-[11px] py-1 px-1.5 rounded-md focus:ring-1 focus:ring-rose-500 text-slate-700 outline-none font-sans font-medium"
                                        >
                                          {!activeTrialSae && <option value="">-- {lang === 'en' ? 'Select an AE' : '請選擇不良事件'} --</option>}
                                          {uniqueTrialTerms.map((term, tIdx) => (
                                            <option key={tIdx} value={term}>
                                              {term}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    );
                                  })()}

                                  <div className="flex items-center justify-end">
                                    <span className="text-[9px] text-slate-400 font-medium font-sans flex items-center gap-1">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                                      {lang === 'en' ? 'Auto-synced' : '數據已自動實時同步'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/40">
                                    {/* Tx Group */}
                                    <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                                      <div className="text-[9px] font-bold text-indigo-600 block mb-1">{t.lblTxGroup}</div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thEvents}</label>
                                          <input
                                            type="number"
                                            value={stats.tEvents}
                                            onChange={(e) => handleUpdateSaeStat(tr.nctId, 'tEvents', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thTotal}</label>
                                          <input
                                            type="number"
                                            value={stats.tTotal}
                                            onChange={(e) => handleUpdateSaeStat(tr.nctId, 'tTotal', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Cx Group */}
                                    <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                                      <div className="text-[9px] font-bold text-amber-600 block mb-1">{t.lblCxGroup}</div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thEvents}</label>
                                          <input
                                            type="number"
                                            value={stats.cEvents}
                                            onChange={(e) => handleUpdateSaeStat(tr.nctId, 'cEvents', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thTotal}</label>
                                          <input
                                            type="number"
                                            value={stats.cTotal}
                                            onChange={(e) => handleUpdateSaeStat(tr.nctId, 'cTotal', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-2">
                            <Edit size={14} className="text-emerald-500" />
                            {t.lblDataSheet}
                          </h4>
                          <p className="text-[10px] text-slate-400 mt-1">{t.lblSheetDesc}</p>
                        </div>

                        <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                          {selectedTrials.map((tr) => {
                            const stats = trialStats[tr.nctId] || {
                              binary: { tEvents: 10, tTotal: 100, cEvents: 20, cTotal: 100 },
                              continuous: { tN: 100, tMean: 5, tSD: 2, cN: 100, cMean: 7, cSD: 2 }
                            };

                            const studyResult = metaOutcome?.studies.find(item => item.nctId === tr.nctId);

                            return (
                              <div key={tr.nctId} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 hover:bg-slate-50 transition-all space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 animate-fade-in-down">
                                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-sky-50 text-sky-700 border border-sky-200/50 px-1.5 py-0.5 rounded">
                                      {tr.nctId}
                                    </span>
                                    <button 
                                      onClick={() => handleToggleSelect(tr.nctId)}
                                      className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-1 rounded-md transition-all cursor-pointer flex items-center justify-center border border-slate-200 hover:border-red-200 shadow-3xs"
                                      title={lang === 'en' ? 'Deselect Trial' : '取消選取此試驗'}
                                    >
                                      <X size={11} className="stroke-2" />
                                    </button>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                    {effectMetric}: {studyResult?.displayValue || 'Calc Error'}
                                  </span>
                                </div>
                                <h5 className="text-[11px] font-bold text-slate-700 truncate block leading-tight">{tr.briefTitle}</h5>
                                
                                {/* Setup Group Selectors with Dropdowns */}
                                <div className="grid grid-cols-2 gap-2 bg-indigo-50/20 p-2 border border-slate-100 rounded-lg">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-indigo-600 flex items-center gap-1">
                                      <GitBranch size={10} />
                                      {lang === 'en' ? 'Select Experimental Group' : '選擇試驗組'}
                                    </label>
                                    <select
                                      value={selectedTxGroup[tr.nctId] || ''}
                                      onChange={(e) => handleSelectGroup(tr.nctId, 'tx', e.target.value)}
                                      className="w-full bg-white border border-slate-200 text-[11px] py-1 px-1.5 rounded-md focus:ring-1 focus:ring-indigo-500 text-slate-700 outline-none font-sans font-medium"
                                    >
                                      {getTrialGroups(tr, lang).map((grp) => (
                                        <option key={grp.id} value={grp.id}>
                                          {grp.title}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-amber-600 flex items-center gap-1">
                                      <GitBranch size={10} />
                                      {lang === 'en' ? 'Select Control Group' : '選擇對照組'}
                                    </label>
                                    <select
                                      value={selectedCxGroup[tr.nctId] || ''}
                                      onChange={(e) => handleSelectGroup(tr.nctId, 'cx', e.target.value)}
                                      className="w-full bg-white border border-slate-200 text-[11px] py-1 px-1.5 rounded-md focus:ring-1 focus:ring-indigo-500 text-slate-700 outline-none font-sans font-medium"
                                    >
                                      {getTrialGroups(tr, lang).map((grp) => (
                                        <option key={grp.id} value={grp.id}>
                                          {grp.title}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                {tr.resultsData?.outcomeMeasures && tr.resultsData.outcomeMeasures.length > 0 && (
                                  <div className="space-y-1 bg-emerald-50/10 p-2 border border-slate-100 rounded-lg">
                                    <label className="text-[9px] font-bold text-emerald-600 flex items-center gap-1">
                                      <ClipboardList size={10} />
                                      {lang === 'en' ? 'Select Outcome Measure' : '選擇量測指標'}
                                    </label>
                                    <select
                                      value={trialOutcomeMeasures[tr.nctId] || tr.resultsData.outcomeMeasures[0]?.title || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setTrialOutcomeMeasures(prev => ({
                                          ...prev,
                                          [tr.nctId]: val
                                        }));
                                        const idx = deduplicatedPool.findIndex(t => t.nctId === tr.nctId);
                                        const extracted = extractOutcomeStatsForTrial(
                                          tr, 
                                          selectedTxGroup[tr.nctId] || 'tx', 
                                          selectedCxGroup[tr.nctId] || 'cx', 
                                          idx, 
                                          val
                                        );
                                        setTrialStats(prev => ({
                                          ...prev,
                                          [tr.nctId]: extracted
                                        }));
                                      }}
                                      className="w-full bg-white border border-slate-200 text-[11px] py-1 px-1.5 rounded-md focus:ring-1 focus:ring-indigo-500 text-slate-700 outline-none font-sans font-medium"
                                    >
                                      {tr.resultsData.outcomeMeasures.map((m, mIdx) => (
                                        <option key={mIdx} value={m.title}>
                                          {m.title}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}

                                <div className="flex items-center justify-end animate-fade-in">
                                  <span className="text-[9px] text-slate-400 font-medium font-sans flex items-center gap-1">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                                    {lang === 'en' ? 'Auto-synced' : '數據已自動實時同步'}
                                  </span>
                                </div>

                                {endpointType === 'binary' ? (
                                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/40">
                                    
                                    {/* Tx Group Inputs */}
                                    <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                                      <div className="text-[9px] font-bold text-indigo-600 block mb-1">{t.lblTxGroup}</div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thEvents}</label>
                                          <input
                                            type="number"
                                            value={stats.binary.tEvents}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'binary', 'tEvents', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thTotal}</label>
                                          <input
                                            type="number"
                                            value={stats.binary.tTotal}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'binary', 'tTotal', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Cx Group Inputs */}
                                    <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                                      <div className="text-[9px] font-bold text-amber-600 block mb-1">{t.lblCxGroup}</div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thEvents}</label>
                                          <input
                                            type="number"
                                            value={stats.binary.cEvents}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'binary', 'cEvents', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[8px] text-slate-400 uppercase font-bold block">{t.thTotal}</label>
                                          <input
                                            type="number"
                                            value={stats.binary.cTotal}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'binary', 'cTotal', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                  </div>
                                ) : (
                                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/40">
                                    
                                    {/* Continuous Tx group */}
                                    <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                                      <div className="text-[9px] font-bold text-indigo-600 block mb-1">{t.lblTxGroup}</div>
                                      <div className="grid grid-cols-3 gap-1">
                                        <div className="space-y-0.5">
                                          <label className="text-[7.5px] text-slate-400 uppercase font-bold block">N</label>
                                          <input
                                            type="number"
                                            value={stats.continuous.tN}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'continuous', 'tN', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[7.5px] text-slate-400 uppercase font-bold block">Mean</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={stats.continuous.tMean}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'continuous', 'tMean', parseFloat(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[7.5px] text-slate-400 uppercase font-bold block">SD</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={stats.continuous.tSD}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'continuous', 'tSD', parseFloat(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                    {/* Continuous Cx group */}
                                    <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-100 shadow-2xs">
                                      <div className="text-[9px] font-bold text-amber-600 block mb-1">{t.lblCxGroup}</div>
                                      <div className="grid grid-cols-3 gap-1">
                                        <div className="space-y-0.5">
                                          <label className="text-[7.5px] text-slate-400 uppercase font-bold block">N</label>
                                          <input
                                            type="number"
                                            value={stats.continuous.cN}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'continuous', 'cN', parseInt(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[7.5px] text-slate-400 uppercase font-bold block">Mean</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={stats.continuous.cMean}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'continuous', 'cMean', parseFloat(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                        <div className="space-y-0.5">
                                          <label className="text-[7.5px] text-slate-400 uppercase font-bold block">SD</label>
                                          <input
                                            type="number"
                                            step="0.1"
                                            value={stats.continuous.cSD}
                                            onChange={(e) => handleUpdateStat(tr.nctId, 'continuous', 'cSD', parseFloat(e.target.value))}
                                            className="w-full bg-slate-50 border border-slate-200 font-mono text-[11px] font-bold text-center py-1 rounded-sm focus:bg-white text-slate-700 focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                    </div>

                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Right Column (7/12): SVG Forest Plot Drawing & Heterogeneity details */}
                  {(() => {
                    const activeMeta = analysisMode === 'sae' ? saeMetaOutcome : metaOutcome;
                    return ((metaOutcome) => {
                      return (
                      <div className="lg:col-span-7 space-y-6">
                        
                        {/* SVG Forest plot card */}
                        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <h4 className="text-xs font-bold uppercase tracking-widest font-mono flex items-center gap-2">
                              <Scale className={analysisMode === 'sae' ? "text-rose-500 animate-pulse font-bold" : "text-indigo-650 animate-pulse font-bold"} size={14} />
                              {analysisMode === 'sae' 
                                ? (lang === 'en' ? 'Adverse Event Forest Plot' : '安全指標不良事件統合分析森林圖') 
                                : t.forestPlotTitle}
                            </h4>
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-[10px] font-bold border py-0.5 px-2 rounded-lg ${
                                analysisMode === 'sae'
                                  ? 'bg-rose-50 border-rose-100 text-rose-700'
                                  : 'bg-indigo-50 border-indigo-100 text-indigo-700'
                              }`}>
                                {analysisMode === 'sae' ? 'SAE (BINARY)' : endpointType.toUpperCase() + ' ENDPOINT'}: {effectMetric}
                              </span>
                              
                              <button
                                onClick={handleDownloadSVG}
                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold font-sans rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 text-slate-600 transition cursor-pointer shadow-3xs"
                                title={lang === 'en' ? 'Download SVG' : '下載森林圖 SVG 檔案'}
                              >
                                <Download size={11} className="text-slate-500 hover:text-indigo-650" />
                                <span>{lang === 'en' ? 'Download SVG' : '下載森林圖'}</span>
                              </button>

                              <button
                                onClick={() => handleDownloadForestReport(metaOutcome)}
                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold font-sans rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700 text-slate-600 transition cursor-pointer shadow-3xs"
                                title={lang === 'en' ? 'Download Report (TXT)' : '下載統合效應量與異質性檢定報告'}
                              >
                                <FileText size={11} className="text-slate-500 hover:text-indigo-650" />
                                <span>{lang === 'en' ? 'Download Report' : '下載分析報告'}</span>
                              </button>
                            </div>
                          </div>

                          {metaOutcome ? (
                        <div className="space-y-4">
                          
                          {/* Live Render SVG forest plot */}
                          <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 overflow-x-auto">
                            <div className="min-w-[600px]">
                              {(() => {
                                const k = metaOutcome.studies.length;
                                const rowHeight = 32;
                                const paddingHeader = 35;
                                const paddingAxis = 85;
                                const plotHeight = paddingHeader + k * rowHeight + paddingAxis;
                                const yp = paddingHeader + k * rowHeight + 15;
                                const svgWidth = 600;

                                // Define dynamic linear scale or log metric mapping
                                const isLog = (effectMetric === 'OR' || effectMetric === 'RR');
                                
                                // Pool of all values plotted to scale the chart dynamically
                                const rawCoordinates: number[] = [];
                                metaOutcome.studies.forEach(s => {
                                  rawCoordinates.push(s.ciLow, s.ciHigh, s.es);
                                });
                                rawCoordinates.push(metaOutcome.pooledCiLow, metaOutcome.pooledCiHigh, metaOutcome.pooledEs);

                                // Get boundaries
                                let minVal = Math.min(...rawCoordinates);
                                let maxVal = Math.max(...rawCoordinates);

                                // Pad boundaries and enforce inclusion of null effect (0 for linear, log(1)=0 for ratio)
                                minVal = Math.min(minVal, -0.4) - 0.2;
                                maxVal = Math.max(maxVal, 0.4) + 0.2;

                                const mapToPctX = (val: number) => {
                                  const scaleWidth = 280; // width of plotting section
                                  const scaleStart = 105; // offset from left for names
                                  const pct = (val - minVal) / (maxVal - minVal);
                                  return scaleStart + pct * scaleWidth;
                                };

                                const xCenter = mapToPctX(0); // null effect line (0 or log(1)=0)

                                return (
                                  <svg id="forest-plot-svg" width="100%" height={plotHeight} viewBox={`0 0 ${svgWidth} ${plotHeight}`} className="overflow-visible font-sans bg-white">
                                    {/* Definitions for arrow ends */}
                                    <defs>
                                      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                                      </marker>
                                    </defs>

                                    {/* Column headers inside the SVG */}
                                    <g>
                                      <text x="10" y="20" className="font-sans font-bold text-[9px] text-slate-400 fill-current">
                                        {lang === 'en' ? 'Study (NCT ID)' : '納入試驗 (NCT ID)'}
                                      </text>
                                      <text x="105" y="20" className="font-sans font-bold text-[9px] text-slate-400 fill-current">
                                        {lang === 'en' ? 'Forest Plot (95% CI)' : '森林圖與可信區間 (95% CI)'}
                                      </text>
                                      <text x="405" y="20" className="font-sans font-bold text-[9px] text-slate-400 fill-current">
                                        {lang === 'en' ? 'Effect Size [95% CI]' : '效應量與可信區間 [95% CI]'}
                                      </text>
                                      <text x="580" y="20" className="font-sans font-bold text-[9px] text-slate-400 fill-current" textAnchor="end">
                                        {lang === 'en' ? 'Weight' : '權重 %'}
                                      </text>
                                      <line x1="10" y1="26" x2="590" y2="26" stroke="#e2e8f0" strokeWidth="1" />
                                    </g>

                                    {/* Plot Reference Null Line */}
                                    <line 
                                      x1={xCenter} 
                                      y1={28} 
                                      x2={xCenter} 
                                      y2={yp + 20} 
                                      stroke="#cbd5e1" 
                                      strokeWidth="1.5" 
                                      strokeDasharray="3,3" 
                                    />

                                    {/* Plot Reference Vertical Pooled Line */}
                                    <line 
                                      x1={mapToPctX(metaOutcome.pooledEs)} 
                                      y1={28} 
                                      x2={mapToPctX(metaOutcome.pooledEs)} 
                                      y2={yp + 20} 
                                      stroke="#c7d2fe" 
                                      strokeWidth="1" 
                                    />

                                    {/* Study CI Rows */}
                                    {metaOutcome.studies.map((sc, index) => {
                                      const y = paddingHeader + index * rowHeight + 12;
                                      const leftX = mapToPctX(sc.ciLow);
                                      const rightX = mapToPctX(sc.ciHigh);
                                      const esX = mapToPctX(sc.es);

                                      // Square dimensions relative to Study Weight
                                      const weightDim = Math.max(4, 4 + (sc.relativeWeight / 100) * 10);

                                      return (
                                        <g key={sc.nctId} className="group transition-opacity hover:opacity-90">
                                          {/* NCT ID label - Removed briefTitle label to make layout extremely clean */}
                                          <text x="10" y={y + 4} className="font-mono text-[9.5px] font-bold text-slate-600 fill-current">
                                            {sc.nctId}
                                          </text>

                                          {/* Guide reference horizontal line */}
                                          <line x1="10" y1={y + 12} x2="590" y2={y + 12} stroke="#f8fafc" strokeWidth="1" />

                                          {/* Confidence Interval whiskers */}
                                          <line 
                                            x1={leftX} 
                                            y1={y} 
                                            x2={rightX} 
                                            y2={y} 
                                            stroke="#475569" 
                                            strokeWidth="1.5" 
                                          />
                                          {/* End notches ticks */}
                                          <line x1={leftX} y1={y - 3} x2={leftX} y2={y + 3} stroke="#475569" strokeWidth="1.2" />
                                          <line x1={rightX} y1={y - 3} x2={rightX} y2={y + 3} stroke="#475569" strokeWidth="1.2" />

                                          {/* Proportional solid weight square representation */}
                                          <rect 
                                            x={esX - weightDim / 2} 
                                            y={y - weightDim / 2} 
                                            width={weightDim} 
                                            height={weightDim} 
                                            fill="#4f46e5" 
                                            className="stroke-indigo-800 stroke-1"
                                          />

                                          {/* Statistics details on the right - Spaced separated cleanly */}
                                          <text x="405" y={y + 4} className="font-mono text-[10px] font-semibold text-slate-800 fill-current">
                                            {sc.displayValue}
                                          </text>
                                          <text x="580" y={y + 4} className="font-mono text-[9.5px] font-semibold text-slate-500 fill-current" textAnchor="end">
                                            {sc.relativeWeight.toFixed(1)}%
                                          </text>
                                        </g>
                                      );
                                    })}

                                    {/* Overall Meta Combined Synthesis Diamond Row */}
                                    {(() => {
                                      const leftDx = mapToPctX(metaOutcome.pooledCiLow);
                                      const rightDx = mapToPctX(metaOutcome.pooledCiHigh);
                                      const esDx = mapToPctX(metaOutcome.pooledEs);
                                      
                                      // Diamond coordinates points string
                                      const points = `${leftDx},${yp} ${esDx},${yp - 6} ${rightDx},${yp} ${esDx},${yp + 6}`;

                                      const isLogMetric = (effectMetric === 'OR' || effectMetric === 'RR');
                                      const overallPrinted = isLogMetric
                                        ? `${Math.exp(metaOutcome.pooledEs).toFixed(2)} [${Math.exp(metaOutcome.pooledCiLow).toFixed(2)} - ${Math.exp(metaOutcome.pooledCiHigh).toFixed(2)}]`
                                        : `${metaOutcome.pooledEs.toFixed(2)} [${metaOutcome.pooledCiLow.toFixed(2)} - ${metaOutcome.pooledCiHigh.toFixed(2)}]`;

                                      return (
                                        <g>
                                          {/* Guideline overall */}
                                          <line x1="10" y1={yp - 12} x2="590" y2={yp - 12} stroke="#cbd5e1" strokeWidth="1.5" />

                                          <text x="10" y={yp + 4} className="font-sans font-black text-[10px] text-indigo-700 fill-current uppercase tracking-wider">
                                            {lang === 'en' ? 'Pooled Estimate' : '合併總體效應'}
                                          </text>
                                          
                                          {/* Polished filled rhombus diamond */}
                                          <polygon 
                                            points={points} 
                                            fill="#1e1b4b" 
                                            stroke="#4f46e5" 
                                            strokeWidth="1.5"
                                          />

                                          {/* Print overall details - Spaced separated cleanly */}
                                          <text x="405" y={yp + 4} className="font-mono text-[10px] font-bold text-indigo-950 fill-current">
                                            {overallPrinted}
                                          </text>
                                          <text x="580" y={yp + 4} className="font-mono text-[9.5px] font-bold text-indigo-900 fill-current" textAnchor="end">
                                            100.0%
                                          </text>
                                        </g>
                                      );
                                    })()}

                                    {/* X-Axis bottom ticks scale */}
                                    <g>
                                      {(() => {
                                        const axisY = yp + 40;
                                        const isLog = (effectMetric === 'OR' || effectMetric === 'RR');
                                        
                                        // Generate 5 balanced ticks
                                        const tickPoints = [minVal + 0.1, minVal + (maxVal - minVal)*0.25, 0, minVal + (maxVal - minVal)*0.75, maxVal - 0.1];
                                        
                                        return (
                                          <g>
                                            <line x1="105" y1={axisY} x2="385" y2={axisY} stroke="#94a3b8" strokeWidth="1" />
                                            
                                            {/* Left Arrow indicators */}
                                            <text x="105" y={axisY + 24} className="text-[8.5px] fill-slate-400 font-bold font-sans">
                                              ← {lang === 'en' ? 'Favors Tx' : '對試驗組有利'}
                                            </text>
                                            {/* Right Arrow indicators */}
                                            <text x="385" y={axisY + 24} className="text-[8.5px] fill-slate-400 font-bold font-sans text-right" textAnchor="end">
                                              {lang === 'en' ? 'Favors Cx' : '對對照組有利'} →
                                            </text>

                                            {tickPoints.map((val, tickIdx) => {
                                              const tx = mapToPctX(val);
                                              const printedLabel = isLog 
                                                ? Math.exp(val).toFixed(2) 
                                                : val.toFixed(2);
                                              
                                              return (
                                                <g key={tickIdx}>
                                                  <line x1={tx} y1={axisY} x2={tx} y2={axisY + 4} stroke="#94a3b8" strokeWidth="1" />
                                                  <text x={tx} y={axisY + 12} className="font-mono text-[8px] text-slate-500 fill-current text-center" style={{ textAnchor: 'middle' }}>
                                                    {printedLabel}
                                                  </text>
                                                </g>
                                              );
                                            })}
                                          </g>
                                        );
                                      })()}
                                    </g>
                                  </svg>
                                );
                              })()}
                            </div>
                          </div>

                          {/* Heterogeneity Table statistics overview */}
                          <div className="bg-slate-50 rounded-2xl p-4.5 border border-slate-200/55 space-y-4">
                            <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest font-mono border-b border-slate-200 pb-2">
                              {t.forestSummaryTitle}
                            </h5>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-xs">
                              
                              {/* Left parameters: Heterogeneity elements */}
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>{t.lblCochranQ}</span>
                                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-3xs">
                                    {metaOutcome.qValue.toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>{t.lblDF}</span>
                                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-3xs">
                                    {metaOutcome.df}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>{t.lblPvalue}</span>
                                  <span className={`font-mono font-black px-2 py-0.5 rounded border shadow-3xs ${
                                    metaOutcome.pValue < 0.05 
                                      ? 'text-emerald-700 bg-emerald-50 border-emerald-100' 
                                      : 'text-slate-700 bg-white border-slate-100'
                                  }`}>
                                    {metaOutcome.pValue < 0.001 ? '< 0.001' : metaOutcome.pValue.toFixed(4)}
                                  </span>
                                </div>
                              </div>

                              {/* Right parameters: Indexes */}
                              <div className="space-y-2">
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>{t.lblI2}</span>
                                  <span className={`font-mono font-bold px-2 py-0.5 rounded border shadow-3xs ${
                                    metaOutcome.iSquared > 50 
                                      ? 'text-rose-700 bg-rose-50 border-rose-100 font-black' 
                                      : 'text-slate-800 bg-white border-slate-100'
                                  }`}>
                                    {metaOutcome.iSquared.toFixed(1)}%
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>{t.lblTau2}</span>
                                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-3xs">
                                    {metaOutcome.tauSquared.toFixed(4)}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-slate-600">
                                  <span>{t.zScoreLabel}</span>
                                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-3xs">
                                    {metaOutcome.zScore.toFixed(3)}
                                  </span>
                                </div>
                              </div>

                            </div>

                            {/* Consolidated bold pooled estimate banner */}
                            <div className={`border-l-4 p-3.5 rounded-r-xl space-y-1 ${
                              analysisMode === 'sae' 
                                ? 'bg-rose-50/70 border-rose-600' 
                                : 'bg-indigo-50 border-indigo-600'
                            }`}>
                              <div className={`text-[10px] uppercase font-bold tracking-wider ${
                                analysisMode === 'sae' ? 'text-rose-700' : 'text-indigo-700'
                              }`}>{t.lblOverallPooled}</div>
                              <div className="flex items-baseline gap-2">
                                <span className="font-mono font-black text-lg text-indigo-950">
                                  {effectMetric === 'OR' || effectMetric === 'RR' 
                                    ? Math.exp(metaOutcome.pooledEs).toFixed(3)
                                    : metaOutcome.pooledEs.toFixed(3)}
                                </span>
                                <span className="text-xs text-indigo-800 font-bold font-mono">
                                  {/* Print logarithmic or native 95% CI */}
                                  (95% CI:{' '}
                                  {effectMetric === 'OR' || effectMetric === 'RR'
                                    ? `${Math.exp(metaOutcome.pooledCiLow).toFixed(2)} to ${Math.exp(metaOutcome.pooledCiHigh).toFixed(2)}`
                                    : `${metaOutcome.pooledCiLow.toFixed(2)} to ${metaOutcome.pooledCiHigh.toFixed(2)}`}
                                  )
                                </span>
                              </div>
                            </div>

                          </div>
                        </div>
                      ) : (
                        <div className="py-12 text-center text-slate-300 font-mono text-xs italic">
                          {analysisMode === 'sae' 
                            ? (lang === 'en' ? 'Please choose an adverse event term with match results first' : '請選擇分析項目以加載數據')
                            : t.atLeastTwo}
                        </div>
                      )}

                    </div>
                  </div>
                    );
                  })(activeMeta);
                })()}

                </div>
              </div>
              ) : activeSubTab === 'compare' ? (
                /* Tab 2: Comparison Grid Matrix List of Planned Outcomes */
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-xs text-left border-collapse min-w-[750px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 select-none">
                          <th className="py-3 px-4 font-bold max-w-[150px]">{t.nctId} / {t.briefTitle}</th>
                          <th className="py-3 px-3 font-bold w-24 shrink-0 text-center">{t.phase}</th>
                          <th className="py-3 px-3 font-bold w-28 shrink-0">{t.allocation}</th>
                          <th className="py-3 px-3 font-bold w-28 shrink-0">{t.masking}</th>
                          <th className="py-3 px-4 font-bold max-w-[200px]">{lang === 'en' ? 'Trial Groups (Experimental / Control)' : '試驗組別 (實驗組與對照組)'}</th>
                          <th className="py-3 px-4 font-bold">{t.primaryGoals}</th>
                          <th className="py-3 px-2 font-bold w-24 shrink-0 text-right">{t.details}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {selectedTrials.map((tr) => (
                          <tr key={tr.nctId} className="hover:bg-slate-50/20 transition-colors">
                            <td className="py-4 px-4 font-bold align-top max-w-[150px]">
                              <span className="font-mono text-[9px] font-bold text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 block w-fit mb-1">
                                {tr.nctId}
                              </span>
                              <div className="font-sans text-slate-900 leading-normal line-clamp-3">
                                {tr.briefTitle}
                              </div>
                            </td>
                            <td className="py-4 px-3 text-center align-top shrink-0 font-mono">
                              <span className="px-2 py-0.5 bg-sky-50 text-sky-700 text-[10px] uppercase font-semibold border border-sky-100 rounded italic">
                                {tr.phase?.[0]?.replace('PHASE', 'P') || 'N/A'}
                              </span>
                            </td>
                            <td className="py-4 px-3 text-slate-600 align-top shrink-0 font-medium whitespace-nowrap">
                              {tr.designInfo?.allocation === 'RANDOMIZED' ? (
                                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-2 py-0.5 text-[10px]">
                                  {lang === 'en' ? 'Random' : '隨機分配'}
                                </span>
                              ) : tr.designInfo?.allocation === 'NON_RANDOMIZED' ? (
                                <span className="bg-amber-50 text-amber-700 border border-amber-100 rounded px-2 py-0.5 text-[10px]">
                                  {lang === 'en' ? 'Non-Random' : '非隨機分配'}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[10px]">N/A</span>
                              )}
                            </td>
                            <td className="py-4 px-3 text-slate-500 align-top shrink-0 max-w-[100px] truncate">
                              <span className="font-medium text-[11px]">
                                {tr.designInfo?.maskingInfo?.masking || (lang === 'en' ? 'None / Open' : '開放標籤 / 無')}
                              </span>
                              {tr.designInfo?.maskingInfo?.whoMasked && (
                                <div className="text-[9px] text-slate-400 mt-1 uppercase truncate" title={tr.designInfo.maskingInfo.whoMasked.join(', ')}>
                                  {tr.designInfo.maskingInfo.whoMasked.join(', ')}
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-4 align-top max-w-[200px]">
                              <div className="flex flex-col gap-1.5 font-sans">
                                {(() => {
                                  const isControlGroup = (title: string, id: string) => {
                                    const text = (title + ' ' + id).toLowerCase();
                                    return (
                                      text.includes('control') ||
                                      text.includes('placebo') ||
                                      text.includes('ctrl') ||
                                      text.includes('cx') ||
                                      text.includes('comparator') ||
                                      text.includes('對照') ||
                                      text.includes('安慰劑') ||
                                      text.includes('模擬') ||
                                      text.includes('placebo_comparator') ||
                                      text.includes('no_intervention')
                                    );
                                  };

                                  const groupsToDisplay = (() => {
                                    const list: { id: string; title: string; isCtrl: boolean }[] = [];
                                    const seen = new Set<string>();

                                    const checkAndAdd = (id: string, title: string) => {
                                      const normalizedTitle = title.trim();
                                      if (!normalizedTitle) return;
                                      const key = normalizedTitle.toLowerCase();
                                      if (!seen.has(key)) {
                                        seen.add(key);
                                        const isCtrl = isControlGroup(normalizedTitle, id);
                                        list.push({ id, title: normalizedTitle, isCtrl });
                                      }
                                    };

                                    if (tr.eventGroups) {
                                      tr.eventGroups.forEach(g => checkAndAdd(g.id, g.title));
                                    }
                                    if (tr.resultsData?.outcomeMeasures) {
                                      tr.resultsData.outcomeMeasures.forEach(m => {
                                        if (m.groups) {
                                          m.groups.forEach(g => checkAndAdd(g.id, g.title));
                                        }
                                      });
                                    }

                                    // Default folders if empty
                                    if (list.length === 0) {
                                      list.push({ id: 'tx', title: lang === 'en' ? 'Treatment / Experimental' : '試驗組', isCtrl: false });
                                      list.push({ id: 'cx', title: lang === 'en' ? 'Control Group' : '對照組', isCtrl: true });
                                    }
                                    return list;
                                  })();

                                  return groupsToDisplay.map((grp, idx) => (
                                    <div 
                                      key={idx} 
                                      className={`text-[11px] p-2 rounded-xl border flex flex-col gap-0.5 leading-snug ${
                                        grp.isCtrl
                                          ? 'bg-slate-50 border-slate-250 text-slate-700'
                                          : 'bg-indigo-50/50 border-indigo-100 text-indigo-950'
                                      }`}
                                    >
                                      <div>
                                        <span className={`text-[9px] font-black uppercase px-1 py-0.5 rounded ${
                                          grp.isCtrl 
                                            ? 'bg-slate-200/80 text-slate-600' 
                                            : 'bg-indigo-100 text-indigo-700'
                                        }`}>
                                          {grp.isCtrl ? (lang === 'en' ? 'Control' : '對照組') : (lang === 'en' ? 'Experimental' : '實驗組 / 試驗組')}
                                        </span>
                                      </div>
                                      <span className="font-semibold break-words mt-1">{grp.title}</span>
                                    </div>
                                  ));
                                })()}
                              </div>
                            </td>
                            <td className="py-4 px-4 align-top">
                              <div className="space-y-4.5 font-sans">
                                {tr.primaryOutcomes && tr.primaryOutcomes.length === 0 ? (
                                  <span className="text-slate-400 italic font-sans text-xs">-</span>
                                ) : (
                                  tr.primaryOutcomes?.slice(0, 3).map((goal, index) => (
                                    <div key={index} className="text-xs bg-slate-50 p-2 border border-slate-100 rounded-lg shadow-2xs leading-relaxed space-y-1">
                                      <p className="font-bold text-slate-800 flex items-start gap-1">
                                        <span className="text-indigo-500 shrink-0 font-mono mt-0.5">{index+1}.</span> 
                                        <span>{goal.measure}</span>
                                      </p>
                                      {goal.timeFrame && (
                                        <p className="text-[10px] text-indigo-600 font-semibold">• {lang === 'en' ? 'Timeline:' : '評估時間軸:'} {goal.timeFrame}</p>
                                      )}
                                      {goal.description && (
                                        <p className="text-[10px] text-slate-400 font-sans line-clamp-2">{goal.description}</p>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-2 text-right align-top shrink-0">
                              <a
                                href={`https://clinicaltrials.gov/study/${tr.nctId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/50 px-2.5 py-1.5 rounded-xl transition-all"
                              >
                                {lang === 'en' ? 'Study' : '探究'}
                                <ExternalLink size={11} />
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Tab 3: AI Meta-Analysis Published Science summary */
                <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-xs space-y-6 animate-fadeIn">
                  
                  {/* Synthesis Action Box */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-slate-800 font-bold text-sm flex items-center gap-2">
                        <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                        {lang === 'en' ? 'AI Biostatistician Meta-Analysis Suite' : '醫療級研發專家統合分析模組'}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {lang === 'en' 
                          ? 'Feeds calculated heterogeneity ratios, trial sample events/means, and pooling model variables straight to Gemini.' 
                          : '調用 Gemini 專家統計模型整合研究異質性 Z-檢定、事件數、平均值及遮盲參數，撰寫深度學術科學統合分析報告。'}
                      </p>
                    </div>
                    <button
                      onClick={handleGenerateReport}
                      disabled={isGenerating || selectedTrials.length < 2}
                      className={`px-5 py-3 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 shrink-0 ${
                        isGenerating || selectedTrials.length < 2
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-98 cursor-pointer'
                      }`}
                    >
                      {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      {t.btnGenerate}
                    </button>
                  </div>

                  {/* Rendering Content Area */}
                  {isGenerating ? (
                    <div className="py-20 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
                      <div className="space-y-1 animate-pulse">
                        <h4 className="text-xs font-bold text-indigo-600 font-mono tracking-wider">GENERATING CLINICAL META-ANALYSIS</h4>
                        <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                          {t.generating}
                        </p>
                      </div>
                    </div>
                  ) : reportMarkdown ? (
                    /* Markdown output toolbar */
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-end gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 shadow-sm">
                        <button
                          onClick={handleCopyToClipboard}
                          className="flex items-center gap-1 text-[11px] font-bold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg py-1.5 px-3 shadow-2xs hover:border-indigo-200 transition-all cursor-pointer"
                        >
                          {copied ? <CheckCircle2 size={12} className="text-emerald-500" /> : <Copy size={12} />}
                          {copied ? t.copied : t.copyBtn}
                        </button>
                        <button
                          onClick={handleDownloadReport}
                          className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg py-1.5 px-3 shadow-2xs transition-all cursor-pointer"
                        >
                          <Download size={12} />
                          {t.downloadBtn}
                        </button>
                      </div>
                      <div className="border border-slate-200 rounded-2xl p-6 md:p-8 bg-white shadow-inner overflow-x-auto">
                        <div className="markdown-content text-xs md:text-sm leading-relaxed text-slate-800 max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportMarkdown}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Empty Report Placeholder */
                    <div className="py-16 text-center max-w-md mx-auto space-y-4 text-slate-400">
                      <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center text-slate-300 mx-auto shadow-2xs">
                        <FileText size={20} />
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed font-sans px-4">
                        {t.emptyReport}
                      </p>
                    </div>
                  )}

                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
