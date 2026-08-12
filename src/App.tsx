/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  Send, 
  MessageSquare, 
  Search, 
  Info, 
  ExternalLink, 
  Loader2, 
  Stethoscope, 
  MapPin, 
  Beaker,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Sparkles,
  AlertTriangle,
  AlertCircle,
  Table,
  BarChart3,
  Settings2,
  Square,
  X,
  Copy,
  Link,
  Check,
  Filter,
  Database,
  Braces,
  ClipboardList,
  BookOpen
} from 'lucide-react';
import { Trial, ChatMessage } from './types';
import { searchTrials, getTrialDetails } from './services/clinicalTrials';
import { parseQuery, summarizeTrial, chatAboutTrials, ParsedQuery, isGeminiRateLimited, setGeminiRateLimit } from './services/gemini';
import AdverseEventsCache from './components/AdverseEventsCache';
import PrimaryOutcomesCache from './components/PrimaryOutcomesCache';
import MetaAnalysisTool from './components/MetaAnalysisTool';

const T = {
  zh: {
    sidebarTitle: "臨床資訊小幫手",
    exampleHeader: "範例查詢",
    examples: [
      "台北的肺癌臨床試驗",
      "第三期糖尿病治療研究",
      "心臟病新藥試驗",
      "黑色素瘤的免疫療法"
    ],
    tipsTitle: "使用技巧",
    tipsContent: "您可以針對特定試驗提出後續問題，例如「哪些正在招募中？」或「總結第二個試驗」。",
    sourceInfo: "數據來源：ClinicalTrials.gov",
    scopeHeader: "當前搜尋範圍",
    scopeContent: "所有疾病、治療方式、試驗階段、狀況與地點",
    resetTitle: "重置對話",
    inputPlaceholder: "詢問疾病、藥物或臨床試驗...",
    abortBtn: "中止對話",
    footerNotice: "臨床試驗助手是一位 AI 智慧助手。提供的資訊僅供參考，不構成醫療建議。參與臨床試驗前請務必諮詢專業醫療人員。",
    helpIntroduceBtn: "幫我介紹試驗",
    explainResultsBtn: "分析試驗結果",
    noResults: "無實際數據",
    hasResults: "有實際數據",
    updated: "更新時間:",
    locationsCount: "處試驗地點",
    viewDetailsBtn: "查看完整詳情 (ClinicalTrials.gov)",
    wantToKnowMore: "也許你還想知道此試驗的相關內容：",
    actions: {
      study_design: "試驗設計",
      locations: "試驗地點",
      primary_outcomes: "主要量測指標",
      secondary_outcomes: "次要量測指標",
      serious_adverse: "主要嚴重不良事件",
      other_adverse: "其他不良事件",
      status_dates: "執行時間與更新狀態",
      intervention_details: "介入方案詳細介紹",
      eligibility_criteria: "受試者納入排除條件",
      references_publications: "相關發表文章"
    },
    tables: {
      secondaryTitle: "次次要量測指標詳細結果",
      studyDesignTitle: "細部試驗設計",
      locationTitle: "試驗地點詳情",
      seriousAdverseTitle: "嚴重不良事件詳情",
      otherAdverseTitle: "其他不良事件詳情",
      viewFullScope: "查看完整擬定測量指標範疇",
      primaryTerm: "主要指標 (Primary)",
      secondaryTerm: "部分次要指標 (Secondary)",
      facility: "設施 (Facility)",
      city: "城市",
      country: "國家",
      term: "項目",
      organ: "器官系統",
      times: "次數",
      people: "人數",
      designLabels: {
        studyType: "研究類型",
        phases: "試驗階段",
        allocation: "參與分配",
        interventionModel: "介入模型",
        primaryPurpose: "主要目的",
        masking: "遮盲方式",
        whoMasked: "遮盲對象"
      }
    },
    messages: {
      bareSingle: "找到試驗 {nctId}。您可以點擊卡片查看詳細資訊或詢問相關問題。",
      bareMultiple: "已為您找到 {count} 項試驗。您可以點擊卡片查看詳細資訊。",
      searchLatest: "我為您找到了 {count} 項符合條件且「最新更新」的臨床試驗。",
      searchRelated: "我為您找到了 {count} 項相關試驗。以下是幾項最相關的結果：",
      searchEmpty: "找不到與該查詢相關的具體試驗。您可以嘗試詢問藥物的一般介紹，或使用更廣泛的搜尋詞。",
      errorOccured: "抱歉，處理時發生了問題。請稍後再試。",
      errorIntroduce: "抱歉，生成介紹時發生問題。"
    },
    pagination: {
      prev: "上 5 個試驗",
      next: "下 5 個試驗",
      stats: "第 {start} - {end} 項試驗，共 {total} 項符合"
    }
  },
  en: {
    sidebarTitle: "Clinical Trial Assistant",
    exampleHeader: "Example Queries",
    examples: [
      "Lung cancer trials in Taipei",
      "Phase 3 diabetes trials",
      "Heart disease drug studies",
      "Immunotherapy for melanoma"
    ],
    tipsTitle: "Tips",
    tipsContent: "You can ask follow-up questions for specific trials, e.g., 'Which ones are recruiting?' or 'Summarize the second trial'.",
    sourceInfo: "Data source: ClinicalTrials.gov",
    scopeHeader: "Current Search Scope",
    scopeContent: "All diseases, interventions, phases, statuses, and locations",
    resetTitle: "Reset Conversation",
    inputPlaceholder: "Ask about diseases, drugs, or clinical trials...",
    abortBtn: "Stop Search",
    footerNotice: "Clinical Trial Assistant is an AI assistant. Information provided is for reference only and does not constitute medical advice. Please consult professional medical personnel before participating in clinical trials.",
    helpIntroduceBtn: "Introduce Trial",
    explainResultsBtn: "Analyze Results",
    noResults: "NO RESULTS",
    hasResults: "HAS RESULTS",
    updated: "UPDATED:",
    locationsCount: "LOCATIONS",
    viewDetailsBtn: "View Full Details (ClinicalTrials.gov)",
    wantToKnowMore: "Maybe you also want to know about this trial's:",
    actions: {
      study_design: "Study Design",
      locations: "Trial Locations",
      primary_outcomes: "Primary Outcomes",
      secondary_outcomes: "Secondary Outcomes",
      serious_adverse: "Serious Adverse Events",
      other_adverse: "Other Adverse Events",
      status_dates: "Timeline & Status",
      intervention_details: "Intervention Details",
      eligibility_criteria: "Inclusion/Exclusion",
      references_publications: "Publications & References"
    },
    tables: {
      secondaryTitle: "Secondary Outcome Measures Details",
      studyDesignTitle: "Detailed Study Design",
      locationTitle: "Trial Locations",
      seriousAdverseTitle: "Serious Adverse Events Details",
      otherAdverseTitle: "Other Adverse Events Details",
      viewFullScope: "View Full Planned Outcome Measures",
      primaryTerm: "Primary Outcomes",
      secondaryTerm: "Some Secondary Outcomes",
      facility: "Facility",
      city: "City",
      country: "Country",
      term: "Term",
      organ: "Organ System",
      times: "Events",
      people: "Subjects",
      designLabels: {
        studyType: "Study Type",
        phases: "Study Phase",
        allocation: "Allocation",
        interventionModel: "Intervention Model",
        primaryPurpose: "Primary Purpose",
        masking: "Masking",
        whoMasked: "Who Masked"
      }
    },
    pagination: {
      prev: "Prev 5",
      next: "Next 5",
      stats: "Trials {start} - {end} of {total} matches"
    },
    messages: {
      bareSingle: "Found trial {nctId}. You can click the card to view detailed info or ask related questions.",
      bareMultiple: "Found {count} trials for you. You can click the cards to view details.",
      searchLatest: "I found {count} matching clinical trials that were recursively updated.",
      searchRelated: "I found {count} related trials for you. Here are some of the most relevant results:",
      searchEmpty: "No specific trials found related to that query. You can try asking for a general description of the drug, or use broader search terms.",
      errorOccured: "Sorry, an error occurred while processing. Please try again later.",
      errorIntroduce: "Sorry, an error occurred while generating the introduction."
    }
  }
};

export default function App() {
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    return (localStorage.getItem('app_lang') as 'zh' | 'en') || 'zh';
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const currentLang = (localStorage.getItem('app_lang') as 'zh' | 'en') || 'zh';
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: currentLang === 'en'
          ? 'Hello! I am your Clinical Trial Assistant. I can help you search and understand various clinical trials. Which diseases or treatments are you interested in?'
          : '您好！我是您的臨床試驗助手。我可以幫您搜尋並了解各項臨床試驗。您對哪些疾病或治療方法感興趣呢？'
      }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTrials, setActiveTrials] = useState<Trial[]>([]);
  // Use a map to track expansion states per message for follow-ups
  const [expandedResponses, setExpandedResponses] = useState<Record<string, Set<string>>>( {}); 
  // Keep track of the current page of trials shown for each search message (1-based)
  const [searchPages, setSearchPages] = useState<Record<string, number>>({});
  
  const [activeTab, setActiveTab] = useState<'chat' | 'efficacy' | 'safety'>('chat');
  const [efficacySubTab, setEfficacySubTab] = useState<'raw' | 'meta'>('raw');
  const [safetySubTab, setSafetySubTab] = useState<'raw' | 'meta'>('raw');
  const [cachedTrials, setCachedTrials] = useState<Trial[]>(() => {
    try {
      const stored = localStorage.getItem('cached_trials');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [cachedOutcomes, setCachedOutcomes] = useState<Trial[]>(() => {
    try {
      const stored = localStorage.getItem('cached_outcomes');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [showRawQuery, setShowRawQuery] = useState<Record<string, boolean>>({});

  const [rateLimitInfo, setRateLimitInfo] = useState<{
    limited: boolean;
    timeLeftMs: number;
    timeLeftMinutes: number;
  }>(() => isGeminiRateLimited());

  // Listen for rate limit exceed events
  useEffect(() => {
    const handleLimitExceeded = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { retryAfterMs, retryAfterMinutes } = customEvent.detail;
      setRateLimitInfo({
        limited: true,
        timeLeftMs: retryAfterMs,
        timeLeftMinutes: retryAfterMinutes
      });
    };

    window.addEventListener('gemini-rate-limit-exceeded', handleLimitExceeded);
    
    // Initial check
    const initial = isGeminiRateLimited();
    if (initial.limited) {
      setRateLimitInfo(initial);
    }

    return () => {
      window.removeEventListener('gemini-rate-limit-exceeded', handleLimitExceeded);
    };
  }, []);

  // Set up second-by-second countdown if rate limited
  useEffect(() => {
    if (!rateLimitInfo.limited) return;

    const timer = setInterval(() => {
      const current = isGeminiRateLimited();
      if (!current.limited) {
        setRateLimitInfo({ limited: false, timeLeftMs: 0, timeLeftMinutes: 0 });
        clearInterval(timer);
      } else {
        setRateLimitInfo(current);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [rateLimitInfo.limited]);

  useEffect(() => {
    localStorage.setItem('cached_trials', JSON.stringify(cachedTrials));
  }, [cachedTrials]);

  useEffect(() => {
    localStorage.setItem('cached_outcomes', JSON.stringify(cachedOutcomes));
  }, [cachedOutcomes]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [importingNctId, setImportingNctId] = useState<string | null>(null);

  const handleImportBoth = async (trial: Trial) => {
    if (importingNctId) return;
    setImportingNctId(trial.nctId);
    try {
      let detailedTrial = trial;
      if (!trial.resultsData && trial.hasResults) {
        const fetched = await getTrialDetails(trial.nctId);
        if (fetched) {
          detailedTrial = fetched;
        }
      }

      const alreadySaeCached = cachedTrials.some(t => t.nctId === detailedTrial.nctId);
      if (!alreadySaeCached) {
        setCachedTrials(prev => [...prev, detailedTrial]);
      }

      const alreadyOutcomesCached = cachedOutcomes.some(t => t.nctId === detailedTrial.nctId);
      if (!alreadyOutcomesCached) {
        setCachedOutcomes(prev => [...prev, detailedTrial]);
      }

      if (alreadySaeCached && alreadyOutcomesCached) {
        setToast({
          message: lang === 'en' 
            ? 'This trial data is already in both caches!' 
            : '此試驗數據已同時在不良事件與主要指標暫存區中！',
          type: 'info'
        });
      } else {
        setToast({
          message: lang === 'en' 
            ? 'Successfully imported both SAE and Outcomes data to respective caches!' 
            : '已成功同時將不良事件與主要指標數據導入各個暫存分頁！',
          type: 'success'
        });
      }
    } catch (err) {
      console.error("Failed to import both databases:", err);
      setToast({
        message: lang === 'en' ? 'Failed to import trial data.' : '導入試驗數據失敗。',
        type: 'error'
      });
    } finally {
      setImportingNctId(null);
    }
  };

  const changeLang = (newLang: 'zh' | 'en') => {
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  useEffect(() => {
    setMessages(prev => prev.map(m => {
      if (m.id === 'welcome') {
        const hasCustomText = m.content !== '您好！我是您的臨床試驗助手。我可以幫您搜尋並了解各項臨床試驗。您對哪些疾病或治療方法感興趣呢？' && m.content !== 'Hello! I am your Clinical Trial Assistant. I can help you search and understand various clinical trials. Which diseases or treatments are you interested in?';
        if (!hasCustomText) {
          return {
            ...m,
            content: lang === 'en'
              ? 'Hello! I am your Clinical Trial Assistant. I can help you search and understand various clinical trials. Which diseases or treatments are you interested in?'
              : '您好！我是您的臨床試驗助手。我可以幫您搜尋並了解各項臨床試驗。您對哪些疾病或治療方法感興趣呢？'
          };
        }
      }
      return m;
    }));
  }, [lang]);

  const toggleExpansion = (messageId: string, type: string) => {
    setExpandedResponses(prev => {
      const current = prev[messageId] || new Set();
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return { ...prev, [messageId]: next };
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      
      // Optionally add a notification message
      setMessages(prev => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: lang === 'en' ? '⚠️ Search aborted.' : '⚠️ 已中止當前查詢。'
        }
      ]);
    }
  };

  const handlePageChange = (messageId: string, messageTrials: Trial[], direction: 'next' | 'prev') => {
    const currentPage = searchPages[messageId] || 1;
    const nextPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
    
    setSearchPages(prev => ({ ...prev, [messageId]: nextPage }));
    
    // Update activeTrials context dynamically based on the newly navigated page of this message
    const pageSize = 5;
    const startIndex = (nextPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, messageTrials.length);
    const paginatedTrials = messageTrials.slice(startIndex, endIndex);
    setActiveTrials(paginatedTrials);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (rateLimitInfo.limited) {
      setToast({
        message: lang === 'zh' 
          ? `已達呼叫上限！請在大約 ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} 分鐘後再試。` 
          : `Calling limit reached! Please try again in about ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} minutes.`,
        type: 'error'
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Parse query with Gemini to understand intent and extract potential NCT ID
      const apiQuery = await parseQuery(input);
      if (controller.signal.aborted) return;
      
      // Extract all NCT IDs from input and AI response
      const nctIdRegex = /NCT\d{8}/gi;
      const allMentionedNctIds = Array.from(new Set([
        ...(input.match(nctIdRegex) || []),
        ...(apiQuery.nctIds || []),
        ...(apiQuery.nctId ? [apiQuery.nctId] : [])
      ])).map(id => id.toUpperCase());

      // Check if the input is ONLY NCT IDs (plus whitespace/commas/Chinese separators)
      const isBareNctSearch = input.replace(nctIdRegex, '').replace(/[\s,，、；;]+/g, '').length === 0;

      // 2. Specialized handling for Results Lookup or multiple ID lookup
      if (allMentionedNctIds.length > 0 && (apiQuery.intent === 'results_lookup' || isBareNctSearch)) {
        const trials: Trial[] = [];
        for (const id of allMentionedNctIds) {
          const trial = await getTrialDetails(id, controller.signal);
          if (trial) trials.push(trial);
        }
        
        if (trials.length > 0) {
          if (controller.signal.aborted) return;
          setActiveTrials(trials);
          
          let responseContent = "";
          let finalCategory = apiQuery.category;

          // Keyword fallback if AI didn't catch the category
          if (!finalCategory && !isBareNctSearch) {
            const hasKeyword = (kEn: string, kZh: string) => input.toLowerCase().includes(kEn) || input.includes(kZh);
            if (hasKeyword('location', '地點') || hasKeyword('hospital', '機構') || hasKeyword('where', '哪裡') || hasKeyword('facility', '試驗單位')) finalCategory = 'locations';
            else if (hasKeyword('design', '設計') || hasKeyword('method', '方法') || hasKeyword('phase', '階段') || hasKeyword('masking', '遮盲')) finalCategory = 'study_design';
            else if (hasKeyword('primary', '主要') && (hasKeyword('outcome', '指標') || hasKeyword('result', '結果') || hasKeyword('data', '數據'))) finalCategory = 'primary_outcomes';
            else if (hasKeyword('secondary', '次要') && (hasKeyword('outcome', '指標') || hasKeyword('result', '結果') || hasKeyword('data', '數據'))) finalCategory = 'secondary_outcomes';
            else if (hasKeyword('serious', '嚴重') && (hasKeyword('adverse', '不良') || hasKeyword('event', '事件') || hasKeyword('sae', 'ＳＡＥ'))) finalCategory = 'serious_adverse';
            else if (hasKeyword('adverse', '不良') || hasKeyword('event', '事件') || hasKeyword('side effect', '副作用') || hasKeyword('side-effect', '不良反應')) finalCategory = 'other_adverse';
            else if (hasKeyword('date', '日期') || hasKeyword('year', '年份') || hasKeyword('timeline', '時間') || hasKeyword('start', '開始') || hasKeyword('complete', '結束') || hasKeyword('update', '更新')) finalCategory = 'status_dates';
          }

          if (isBareNctSearch) {
            responseContent = trials.length === 1 
              ? T[lang].messages.bareSingle.replace('{nctId}', trials[0].nctId)
              : T[lang].messages.bareMultiple.replace('{count}', trials.length.toString());
          } else if (finalCategory) {
            const trial = trials[0]; // Categorical queries usually target one trial or the first one found
            let categoryPrompt = "";
            if (lang === 'en') {
              switch(finalCategory) {
                case 'study_design': categoryPrompt = `Please summarize and detail the "study design" for trial ${trial.nctId}, including study type, phase, allocation, model, purpose, and masking. Conclude with how these designs affect the reliability of the study.`; break;
                case 'locations': categoryPrompt = `Please list all trial locations and their distribution for trial ${trial.nctId}, and analyze the geographic characteristics.`; break;
                case 'primary_outcomes': categoryPrompt = `Please analyze the "primary outcome measures" for trial ${trial.nctId} in detail, including descriptions, time frames, and most importantly, the actual measurement results data. Keep the data and numbers as the core analysis.`; break;
                case 'secondary_outcomes': categoryPrompt = `Please summarize the "secondary outcome measures" and relevant data findings for trial ${trial.nctId}, explaining their significance.`; break;
                case 'serious_adverse': categoryPrompt = `For trial ${trial.nctId}, please detail all "serious adverse events", including term, organ systems, counts, and subjects affected, highlighting high-incidence items.`; break;
                case 'other_adverse': categoryPrompt = `For trial ${trial.nctId}, please detail all "other adverse events", including term, organ systems, counts, and subjects affected, analyzing common side effects.`; break;
                case 'status_dates': categoryPrompt = `Please outline all key timelines and dates for trial ${trial.nctId}. Analyze statusModule to detail the start date, expected/actual completion dates, primary completion date, and last submission date.`; break;
              }
            } else {
              switch(finalCategory) {
                case 'study_design': categoryPrompt = `請統整並詳細列出試驗 ${trial.nctId} 的「試驗設計」相關資訊，包含研究類型、階段、分配、模型、目的與遮盲方式。最後請總結這些設計對試驗可信度的影響。`; break;
                case 'locations': categoryPrompt = `請列出試驗 ${trial.nctId} 的所有試驗地點與分布情況，並分析其地理分布特點。`; break;
                case 'primary_outcomes': categoryPrompt = `請詳細分析試驗 ${trial.nctId} 的「主要量測指標」，包含指標內容、測量時間點、說明，以及最重要的「實際測量結果數據」。請以數據為核心進行詳細解讀。`; break;
                case 'secondary_outcomes': categoryPrompt = `請列表統整試驗 ${trial.nctId} 的「次要量測指標」內容與相關發現數據，並簡述這些指標對整體研究的補充意義。`; break;
                case 'serious_adverse': categoryPrompt = `針對試驗 ${trial.nctId}，請詳細列出所有發生的「嚴重不良事件」，包含事件名稱、受影響人數與次數。請特別註明發生率較高的項目。`; break;
                case 'other_adverse': categoryPrompt = `針對試驗 ${trial.nctId}，請詳細列出所有發生的「其他不良事件」，包含事件名稱、受影響人數與次數。請分析常見的副作用及其嚴重程度。`; break;
                case 'status_dates': categoryPrompt = `請詳細列出試驗 ${trial.nctId} 的所有重要時間節點與日期相關資訊。請讀取 statusModule 並說明試驗的開始日期、預計完成日期、主要指標完成日期以及最後更新日期等。`; break;
              }
            }
            responseContent = await chatAboutTrials(categoryPrompt, [trial], lang);
          } else {
            responseContent = await chatAboutTrials(input, trials, lang);
          }

          if (controller.signal.aborted) return;
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: responseContent,
            trials: trials,
            relatedTrial: trials.length === 1 ? trials[0] : undefined,
            parsedQuery: apiQuery
          };
          setMessages(prev => [...prev, assistantMessage]);
          
          // If a specific category was detected, expand the corresponding table
          if (finalCategory && trials.length === 1) {
            setTimeout(() => {
              toggleExpansion(assistantMessage.id, finalCategory!);
            }, 100);
          }

          setIsLoading(false);
          abortControllerRef.current = null;
          return;
        }
      }

      // 3. Decide if we should search or just chat
      let newMessages: ChatMessage[] = [];
      
      if (apiQuery.intent === 'search') {
        // Fetch up to 20 trials for user to iterate & paginate through
        const searchResult = await searchTrials(apiQuery, 20, controller.signal);
        if (controller.signal.aborted) return;
        const trials = searchResult.trials;
        const searchUrl = searchResult.url;
        // Keep activeTrials synced with the first page (0 to 5) initially to feed subsequent questions
        setActiveTrials(trials.slice(0, 5));
        
        let content = '';
        if (trials.length > 0) {
          if (apiQuery.sort === '@lastUpdateSubmitDate:desc') {
            content = T[lang].messages.searchLatest.replace('{count}', trials.length.toString());
          } else {
            content = T[lang].messages.searchRelated.replace('{count}', trials.length.toString());
          }
        } else {
          content = T[lang].messages.searchEmpty;
        }

        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: content,
          trials: trials,
          apiUrl: searchUrl,
          parsedQuery: apiQuery
        };
        newMessages.push(assistantMessage);
      } else {
        // If intent is chat (includes general Q&A, greetings, follow-ups)
        const response = await chatAboutTrials(input, activeTrials, lang);
        if (controller.signal.aborted) return;
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          parsedQuery: apiQuery
        };
        newMessages.push(assistantMessage);
      }

      setMessages(prev => [...prev, ...newMessages]);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Request was aborted');
        return;
      }
      console.error(error);
      setMessages(prev => [
        ...prev, 
        { 
          id: Date.now().toString(), 
          role: 'assistant', 
          content: T[lang].messages.errorOccured 
        }
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleSummarize = async (trial: Trial) => {
    if (isLoading) return;

    if (rateLimitInfo.limited) {
      setToast({
        message: lang === 'zh' 
          ? `已達呼叫上限！請在大約 ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} 分鐘後再試。` 
          : `Calling limit reached! Please try again in about ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} minutes.`,
        type: 'error'
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: lang === 'en' ? `Please summarize and introduce trial ${trial.nctId}.` : `請幫我介紹試驗 ${trial.nctId}。`,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let detailedTrial = trial;
      if (!trial.resultsData && trial.hasResults) {
        try {
          const fetched = await getTrialDetails(trial.nctId, controller.signal);
          if (fetched) {
            detailedTrial = fetched;
          }
        } catch (err) {
          console.error("Failed to fetch detailed trial in handleSummarize:", err);
        }
      }

      const summary = await summarizeTrial(detailedTrial, lang);
      if (controller.signal.aborted) return;
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: summary,
        relatedTrial: detailedTrial
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error(error);
      setMessages(prev => [
        ...prev, 
        { 
          id: Date.now().toString(), 
          role: 'assistant', 
          content: T[lang].messages.errorIntroduce 
        }
      ]);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleFollowUp = async (trial: Trial, actionLabel: string, actionType: string) => {
    if (isLoading) return;

    if (rateLimitInfo.limited) {
      setToast({
        message: lang === 'zh' 
          ? `已達呼叫上限！請在大約 ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} 分鐘後再試。` 
          : `Calling limit reached! Please try again in about ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} minutes.`,
        type: 'error'
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: actionLabel,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Fetch full details if we don't have resultsData but the trial hasResults is true, or if we need modules for custom follow-ups
    let detailedTrial = trial;
    const isCustomAction = ['intervention_details', 'eligibility_criteria', 'references_publications'].includes(actionType);
    const needsDetailedModules = isCustomAction && (!trial.armsInterventionsModule || !trial.eligibilityModule || !trial.referencesModule);
    if ((!trial.resultsData && trial.hasResults) || needsDetailedModules) {
      try {
        const fetched = await getTrialDetails(trial.nctId, controller.signal);
        if (fetched) {
          detailedTrial = fetched;
        }
      } catch (err) {
        console.error("Failed to fetch detailed trial in handleFollowUp:", err);
      }
    }

    let prompt = "";
    if (lang === 'en') {
      switch(actionType) {
        case 'study_design': prompt = `Please summarize and detail the "study design" for trial ${detailedTrial.nctId}, including study type, phase, allocation, model, purpose, and masking. Conclude with how these designs affect the reliability of the study.`; break;
        case 'locations': prompt = `Please list all trial locations for trial ${detailedTrial.nctId}.`; break;
        case 'primary_outcomes': prompt = `Please summarize and explain the "primary outcome measures" for trial ${detailedTrial.nctId}.`; break;
        case 'secondary_outcomes': prompt = `Please summarize the "secondary outcome measures" for trial ${detailedTrial.nctId} and explain how they complement the primary outcomes.`; break;
        case 'serious_adverse': prompt = `Please summarize the "serious adverse events" reported in trial ${detailedTrial.nctId} and analyze safety profiles.`; break;
        case 'other_adverse': prompt = `Please summarize "other adverse events" reported in trial ${detailedTrial.nctId}.`; break;
        case 'status_dates': prompt = `Please analyze all timelines for trial ${detailedTrial.nctId}, including start date, completion date, and update times.`; break;
        case 'intervention_details': prompt = `Please analyze and detail the "arms interventions" (armsInterventionsModule) for trial ${detailedTrial.nctId}. Describe the study groups (arm groups, including their names, types, and descriptions) and explain what specific treatments, interventions, or procedures subjects in each group receive.`; break;
        case 'eligibility_criteria': prompt = `Please analyze the "eligibility" (eligibilityModule) details for trial ${detailedTrial.nctId}. Present the subject inclusion criteria and exclusion criteria clearly using separate bullet-pointed lists. Also include other details such as gender, age range, and whether healthy volunteers are accepted.`; break;
        case 'references_publications': prompt = `For trial ${detailedTrial.nctId}, please read the protocolSection.referencesModule information. You ONLY need to provide a simple summary/introduction for publications of type "Result" (which publish the study results). If there are no "Result" type papers, briefly mention that or provide an extremely concise overview of other publications. Remind the user that a complete reference table with external PubMed link buttons is rendered below your response. Please reply in English.`; break;
        default: prompt = `About trial ${detailedTrial.nctId}'s ${actionLabel}.`;
      }
    } else {
      switch(actionType) {
        case 'study_design': prompt = `請統整並詳細列出試驗 ${detailedTrial.nctId} 的「試驗設計」相關資訊，包含研究類型、階段、分配、模型、目的與遮盲方式。最後請總結這些設計對試驗可信度的影響。`; break;
        case 'locations': prompt = `請列出試驗 ${detailedTrial.nctId} 的所有試驗地點。`; break;
        case 'primary_outcomes': prompt = `請統整並說明試驗 ${detailedTrial.nctId} 的「主要測量指標 (Primary Outcome Measures)」。`; break;
        case 'secondary_outcomes': prompt = `請統整試驗 ${detailedTrial.nctId} 的「次要測量指標」，並解釋這些指標如何補充主要指標。`; break;
        case 'serious_adverse': prompt = `請統整試驗 ${detailedTrial.nctId} 中報告的「嚴重不良事件」，並分析其安全性狀況。`; break;
        case 'other_adverse': prompt = `請統整試驗 ${detailedTrial.nctId} 中報告的「其他不良事件」。`; break;
        case 'status_dates': prompt = `請詳細分析試驗 ${detailedTrial.nctId} 的所有時間點，包含開始日期、完成日期與更新時間。`; break;
        case 'intervention_details': prompt = `請讀取該試驗 ${detailedTrial.nctId} 的 protocolSection.armsInterventionsModule 部分。詳細介紹該試驗的分組資訊（Arm Groups，如組別名稱、類型、描述），以及受試者在各個組別中接受了什麼樣的具體治療、藥物或處置（Interventions）。請以清晰易懂、富有結構的繁體中文回答，並使用適當的標題和列表。`; break;
        case 'eligibility_criteria': prompt = `請讀取該試驗 ${detailedTrial.nctId} 的 protocolSection.eligibilityModule 部分資訊。請特別以清晰「列點 (bullet points)」的方式，將受試者的「納入條件 (Inclusion Criteria)」與「排除條件 (Exclusion Criteria)」進行整理並詳細列出。同時提及其他資格條件（如性別、年齡限制、是否招募健康自願者等）。請務必使用繁體中文回答，格式需簡潔、對比分明且易於閱讀。`; break;
        case 'references_publications': prompt = `請讀取該試驗 ${detailedTrial.nctId} 的 protocolSection.referencesModule 部分資訊。在您的文字回答中，您【只需要】針對類型是「Result（試驗結果發表）」的文章進行簡單介紹。如果沒有任何類型是 Result 的文章，請親切告知使用者，或對其他類型的文獻進行極簡短的背景說明。請在回答結尾親切提醒使用者，下方已為他們製作了完整的「相關文章與文獻表格」，可以直接點擊按鈕前往 PubMed 閱讀原文。請務必使用繁體中文回答。`; break;
        default: prompt = `關於試驗 ${detailedTrial.nctId} 的 ${actionLabel}。`;
      }
    }

    try {
      const response = await chatAboutTrials(prompt, [detailedTrial], lang);
      if (controller.signal.aborted) return;
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        relatedTrial: detailedTrial
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Automatically expand the relevant section in the latest message
      setTimeout(() => {
        toggleExpansion(assistantMessage.id, actionType);
      }, 100);

    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error(error);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  const handleExplainResults = async (trial: Trial) => {
    if (isLoading) return;

    if (rateLimitInfo.limited) {
      setToast({
        message: lang === 'zh' 
          ? `已達呼叫上限！請在大約 ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} 分鐘後再試。` 
          : `Calling limit reached! Please try again in about ${Math.ceil(rateLimitInfo.timeLeftMs / 1000 / 60)} minutes.`,
        type: 'error'
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: lang === 'en' ? `Please analyze actual data and results for ${trial.nctId}.` : `請分析 ${trial.nctId} 的實際數據結果。`,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      let detailedTrial = trial;
      if (!trial.resultsData && trial.hasResults) {
        try {
          const fetched = await getTrialDetails(trial.nctId, controller.signal);
          if (fetched) {
            detailedTrial = fetched;
          }
        } catch (err) {
          console.error("Failed to fetch detailed trial in handleExplainResults:", err);
        }
      }

      const queryPrompt = lang === 'en'
        ? `Please detail and analyze primary outcome measures and actual measurement results data for trial ${detailedTrial.nctId}.`
        : `請詳細分析 ${detailedTrial.nctId} 的主要量測指標內容與實際測量結果數據。`;
      const response = await chatAboutTrials(queryPrompt, [detailedTrial], lang);
      if (controller.signal.aborted) return;
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        relatedTrial: detailedTrial
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
      console.error(error);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] text-slate-900 font-sans">
      {/* Top Header - Full Width spanning completely left-to-right */}
      <header className="h-[46px] border-b border-slate-200 bg-slate-100 flex items-stretch px-6 sticky top-0 z-10 w-full justify-between shrink-0">
        {/* Left Aligned: Tab Switcher (Chrome style) */}
        <div className="flex items-end h-full gap-1.5">
          <button
            id="tab-chat"
            onClick={() => setActiveTab('chat')}
            className={`px-4 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 relative -mb-[1px] h-8 border-t border-x ${
              activeTab === 'chat'
                ? 'bg-white text-indigo-600 border-slate-200 border-b-transparent shadow-[0_-1px_2px_rgba(0,0,0,0.03)] z-10'
                : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border-transparent'
            }`}
          >
            <MessageSquare size={13} />
            {lang === 'en' ? 'Chat' : '對話諮詢'}
          </button>
          
          <button
            id="tab-efficacy"
            onClick={() => setActiveTab('efficacy')}
            className={`px-4 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 relative -mb-[1px] h-8 border-t border-x ${
              activeTab === 'efficacy'
                ? 'bg-white text-indigo-600 border-slate-200 border-b-transparent shadow-[0_-1px_2px_rgba(0,0,0,0.03)] z-10'
                : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border-transparent'
            }`}
          >
            <BarChart3 size={13} className={activeTab === 'efficacy' ? 'text-indigo-600' : 'text-slate-400'} />
            {lang === 'en' ? 'Efficacy Meta-Analysis' : '療效統合分析'}
            {cachedOutcomes.length > 0 && (
              <span className="min-w-[16px] h-4 bg-indigo-500 text-white rounded-full flex items-center justify-center text-[8.5px] px-1 font-mono font-bold leading-none animate-pulse shrink-0">
                {cachedOutcomes.length}
              </span>
            )}
          </button>

          <button
            id="tab-safety"
            onClick={() => setActiveTab('safety')}
            className={`px-4 text-xs font-semibold rounded-t-lg transition-all flex items-center gap-2 relative -mb-[1px] h-8 border-t border-x ${
              activeTab === 'safety'
                ? 'bg-white text-rose-600 border-slate-200 border-b-transparent shadow-[0_-1px_2px_rgba(0,0,0,0.03)] z-10'
                : 'bg-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border-transparent'
            }`}
          >
            <AlertTriangle size={13} className={activeTab === 'safety' ? 'text-rose-500' : 'text-slate-400'} />
            {lang === 'en' ? 'Safety Meta-Analysis' : '安全性統合分析'}
            {cachedTrials.length > 0 && (
              <span className="min-w-[16px] h-4 bg-rose-500 text-white rounded-full flex items-center justify-center text-[8.5px] px-1 font-mono font-bold leading-none animate-pulse shrink-0">
                {cachedTrials.length}
              </span>
            )}
          </button>
        </div>

        {/* Right Aligned: Language Switcher Only */}
        <div className="flex items-center gap-3 h-full">
          <div className="flex bg-slate-200/60 p-0.5 rounded-lg border border-slate-200/80">
            <button
              onClick={() => changeLang('zh')}
              className={`text-xs font-bold rounded-lg transition-all flex items-center justify-center ${
                lang === 'zh'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              style={{ width: '30px', paddingLeft: '4px', paddingRight: '4px', height: '24px' }}
            >
              中
            </button>
            <button
              onClick={() => changeLang('en')}
              className={`text-xs font-bold rounded-lg transition-all flex items-center justify-center ${
                lang === 'en'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              style={{ width: '30px', paddingLeft: '4px', paddingRight: '4px', height: '24px' }}
            >
              EN
            </button>
          </div>
        </div>
      </header>

      {/* Main Body - Split Layout */}
      <div className="flex flex-1 overflow-hidden relative w-full">
        {/* Sidebar - Positioned specifically inside Chat view and styled compactly */}
        {activeTab === 'chat' && (
          <div className="hidden md:flex w-72 flex-col bg-white border-r border-slate-200 p-5 shrink-0 transition-all duration-300 overflow-y-auto">
            {/* Header / Brand text moved down into the sidebar */}
            <div className="flex items-center gap-3 mb-6 mt-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0 shadow-md">
                <Stethoscope size={16} />
              </div>
              <h1 className="font-bold text-sm md:text-base tracking-tight text-slate-800 leading-tight">{T[lang].sidebarTitle}</h1>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{T[lang].exampleHeader}</p>
                <div className="flex flex-col gap-1.5">
                  {T[lang].examples.map((query, index) => (
                    <button
                      key={index}
                      onClick={() => setInput(query)}
                      className="text-left text-xs md:text-[13px] px-3 py-2 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors flex items-center gap-2 group select-none whitespace-nowrap truncate"
                    >
                      <Search size={13} className="text-slate-300 group-hover:text-indigo-500 shrink-0" />
                      <span className="truncate">{query}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <div className="bg-indigo-50 rounded-xl p-3.5">
                  <div className="flex items-center gap-2 text-indigo-700 mb-1.5">
                    <Sparkles size={14} className="shrink-0" />
                    <span className="text-xs font-bold uppercase">{T[lang].tipsTitle}</span>
                  </div>
                  <p className="text-xs text-indigo-900 leading-relaxed font-normal">
                    {T[lang].tipsContent}
                  </p>
                </div>

                {/* Reset / Refresh Conversation button placed cleanly underneath the Tips card */}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setMessages([{
                        id: 'welcome',
                        role: 'assistant',
                        content: lang === 'en' ? 'Conversation reset. How can I assist you today?' : '對話已重置。今天有什麼我可以幫您的嗎？'
                      }]);
                      setActiveTrials([]);
                      setSearchPages({});
                    }}
                    className="w-full py-2 px-3.5 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl text-xs text-red-700 font-semibold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer select-none"
                  >
                    <RefreshCcw size={13} />
                    <span>{lang === 'en' ? 'Reset Conversation' : '對話重整'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-5">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <Info size={12} className="shrink-0" />
                <span className="truncate">{T[lang].sourceInfo}</span>
              </div>
            </div>
          </div>
        )}

        {/* Content Viewport Container */}
        <div className="flex-1 flex flex-col relative h-full max-w-full overflow-hidden">
          {activeTab === 'chat' ? (
            <>
              {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
              <AnimatePresence initial={false}>
                {messages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] md:max-w-[70%] flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${
                        message.role === 'user' 
                          ? 'bg-slate-800 text-white' 
                          : 'bg-indigo-100 text-indigo-600'
                      }`}>
                        {message.role === 'user' ? <MessageSquare size={16} /> : <Loader2 size={16} className={isLoading && index === messages.length - 1 ? 'animate-spin' : ''} />}
                      </div>
                      <div className="space-y-4">
                        <div className={`p-4 rounded-2xl ${
                          message.role === 'user' 
                            ? 'bg-slate-800 text-white shadow-lg' 
                            : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                        }`}>
                          <div className={`text-xs md:text-sm leading-relaxed ${message.role === 'user' ? '' : 'markdown-content'}`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                          </div>
                        </div>

                        {false && message.apiUrl && (
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 font-sans text-xs shadow-sm">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
                                <Link size={13} className="text-indigo-500 shrink-0" />
                                <span>ClinicalTrials.gov API 請求網址 (API Request URL)</span>
                              </div>
                              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(message.apiUrl || '');
                                    setCopiedUrlId(message.id);
                                    setTimeout(() => setCopiedUrlId(null), 2000);
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-semibold transition-all active:scale-95 shadow-sm cursor-pointer"
                                >
                                  {copiedUrlId === message.id ? (
                                    <>
                                      <Check size={11} className="text-emerald-500" />
                                      <span className="text-emerald-600">已複製</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy size={11} />
                                      <span>複製</span>
                                    </>
                                  )}
                                </button>
                                <a
                                  href={message.apiUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[11px] font-semibold transition-all shadow-sm"
                                >
                                  <ExternalLink size={11} />
                                  <span>新分頁開啟</span>
                                </a>
                              </div>
                            </div>
                            <div className="p-3 bg-slate-900 text-indigo-300 rounded-xl font-mono text-[11px] leading-relaxed break-all select-all border border-slate-800 shadow-inner max-w-full overflow-x-auto">
                              {message.apiUrl}
                            </div>
                          </div>
                        )}

                        {false && message.parsedQuery && (
                          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 font-sans text-xs shadow-sm mt-3">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                                <Filter size={14} className="text-teal-500 shrink-0" />
                                <span>系統解析篩選條件 (Parsed Trial Conditions)</span>
                              </div>
                              <button
                                onClick={() => setShowRawQuery(prev => ({ ...prev, [message.id]: !prev[message.id] }))}
                                className="flex items-center gap-1 px-2.5 py-1 text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-semibold transition-all shadow-sm cursor-pointer"
                              >
                                <Braces size={10} className="text-slate-400" />
                                <span>{showRawQuery[message.id] ? '顯示簡明欄位' : '顯示原始 JSON'}</span>
                              </button>
                            </div>

                            {showRawQuery[message.id] ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                                  <span>RAW PARSED QUERY JSON</span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(JSON.stringify(message.parsedQuery, null, 2));
                                      setCopiedUrlId(message.id + '_json');
                                      setTimeout(() => setCopiedUrlId(null), 2000);
                                    }}
                                    className="hover:text-indigo-600 flex items-center gap-0.5 cursor-pointer"
                                  >
                                    {copiedUrlId === message.id + '_json' ? (
                                      <>
                                        <Check size={10} className="text-emerald-500" />
                                        <span className="text-emerald-600 font-medium">已複製</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={10} />
                                        <span>複製 JSON</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-3 bg-slate-900 text-teal-400 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800 shadow-inner max-h-[180px] overflow-y-auto">
                                  {JSON.stringify(message.parsedQuery, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {message.parsedQuery.cond && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">研究疾病 (Condition)</span>
                                    <span className="text-slate-800 font-medium break-words">{message.parsedQuery.cond}</span>
                                  </div>
                                )}
                                {message.parsedQuery.intr && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">藥物 / 干預措施 (Intervention)</span>
                                    <span className="text-indigo-600 font-semibold break-words flex items-center gap-1">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                                      {message.parsedQuery.intr}
                                    </span>
                                  </div>
                                )}
                                {message.parsedQuery.term && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">關鍵字 (Term)</span>
                                    <span className="text-slate-700 font-mono break-all">{message.parsedQuery.term}</span>
                                  </div>
                                )}
                                {message.parsedQuery.locn && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">試驗地區 (Location)</span>
                                    <span className="text-slate-700 break-words font-medium">{message.parsedQuery.locn}</span>
                                  </div>
                                )}
                                {message.parsedQuery.phase && message.parsedQuery.phase.length > 0 && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">試驗階段 (Phase)</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {message.parsedQuery.phase.map((p, idx) => (
                                        <span key={idx} className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md font-mono font-medium text-[10px]">
                                          {p}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {message.parsedQuery.status && message.parsedQuery.status.length > 0 && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">招募狀態 (Status)</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {message.parsedQuery.status.map((s, idx) => (
                                        <span key={idx} className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-mono font-medium text-[10px]">
                                          {s}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {message.parsedQuery.primaryPurpose && message.parsedQuery.primaryPurpose.length > 0 && (
                                  <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">主要目的 (Purpose)</span>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {message.parsedQuery.primaryPurpose.map((p, idx) => (
                                        <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-mono font-medium text-[10px]">
                                          {p}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <div className="flex flex-col gap-1 bg-slate-50 border border-slate-100 rounded-xl p-2.5">
                                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">對話意圖與剖析 (Intent & Focus)</span>
                                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-md font-medium text-[10px]">
                                      Intent: {message.parsedQuery.intent}
                                    </span>
                                    {message.parsedQuery.category && (
                                      <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-md font-medium text-[10px]">
                                        Category: {message.parsedQuery.category}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {message.trials && message.trials.length > 0 && (() => {
                          const currentPage = searchPages[message.id] || 1;
                          const pageSize = 5;
                          const totalTrials = message.trials.length;
                          const totalPages = Math.ceil(totalTrials / pageSize);
                          const startIndex = (currentPage - 1) * pageSize;
                          const endIndex = Math.min(startIndex + pageSize, totalTrials);
                          const currentTrials = message.trials.slice(startIndex, endIndex);

                          return (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 gap-4 mt-2">
                                {currentTrials.map((trial) => (
                                  <motion.div 
                                    key={trial.nctId}
                                    layout
                                    className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                                  >
                                    <div className="p-5 space-y-3 font-[Inter]">
                                      <div className="flex justify-between items-start gap-2">
                                        <div className="flex flex-wrap gap-2">
                                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase rounded-md border border-indigo-100">
                                            {trial.status}
                                          </span>
                                          {trial.hasResults ? (
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase rounded-md border border-emerald-100 flex items-center gap-1 shadow-sm">
                                              <Beaker size={10} /> {T[lang].hasResults}
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 bg-slate-50 text-slate-400 text-[10px] font-bold uppercase rounded-md border border-slate-200 flex items-center gap-1">
                                              <Info size={10} /> {T[lang].noResults}
                                            </span>
                                          )}
                                          {trial.lastUpdateSubmitDate && (
                                            <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-bold uppercase rounded-md border border-amber-100 flex items-center gap-1">
                                              <Calendar size={10} /> {T[lang].updated} {trial.lastUpdateSubmitDate}
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] font-mono text-slate-400 shrink-0">{trial.nctId}</span>
                                      </div>
                                      <h3 className="font-bold text-slate-900 leading-snug">
                                        {trial.briefTitle}
                                      </h3>
                                      
                                      {((trial.phase && trial.phase.length > 0) || (trial.primaryOutcomes && trial.primaryOutcomes.length > 0)) && (
                                        <div className="flex flex-wrap gap-1.5 items-center mt-1">
                                          {trial.phase && trial.phase.length > 0 && (
                                            trial.phase.map(p => (
                                              <span key={p} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase rounded border border-blue-100 italic shrink-0">
                                                {p}
                                              </span>
                                            ))
                                          )}
                                          {trial.primaryOutcomes && trial.primaryOutcomes.length > 0 && (
                                            trial.primaryOutcomes.slice(0, 3).map((po, idx) => (
                                              <span 
                                                key={idx} 
                                                className="px-2 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded border border-violet-100 truncate max-w-[200px] shrink-0"
                                                title={po.measure}
                                              >
                                                <span className="text-violet-500 font-extrabold mr-1">PO:</span>
                                                {po.measure}
                                              </span>
                                            ))
                                          )}
                                        </div>
                                      )}
                                      
                                      <div className="flex flex-wrap gap-1 text-[10px] pt-1">
                                        {trial.conditions.slice(0, 3).map(c => (
                                          <span key={c} className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{c}</span>
                                        ))}
                                        {trial.interventions && trial.interventions.length > 0 && (
                                          trial.interventions.slice(0, 2).map((intv, idx) => (
                                            <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full flex items-center gap-0.5 max-w-[150px] truncate" title={`${intv.type}: ${intv.name}`}>
                                              <Beaker size={9} className="shrink-0" /> {intv.name}
                                            </span>
                                          ))
                                        )}
                                        {trial.locations && trial.locations.length > 0 && (
                                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full flex items-center gap-1">
                                            <MapPin size={10} /> {trial.locations.length} {T[lang].locationsCount}
                                          </span>
                                        )}
                                      </div>

                                      <div className="pt-3 flex flex-row items-center justify-between gap-3">
                                        <button 
                                          onClick={() => handleSummarize(trial)}
                                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-2.5 rounded-xl transition-all shadow-sm active:scale-[0.98] disabled:opacity-50"
                                          disabled={isLoading}
                                        >
                                          <Sparkles size={14} />
                                          {T[lang].helpIntroduceBtn}
                                        </button>
                                        {trial.hasResults && (
                                          <button
                                            onClick={() => handleImportBoth(trial)}
                                            disabled={importingNctId !== null}
                                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-2.5 rounded-xl transition-all shadow-xs active:scale-[0.98] disabled:opacity-50"
                                          >
                                            {importingNctId === trial.nctId ? (
                                              <Loader2 size={14} className="animate-spin text-emerald-600" />
                                            ) : (
                                              <Table size={14} />
                                            )}
                                            {lang === 'en' ? 'Import Data' : '導入數據'}
                                          </button>
                                        )}
                                      </div>
                                      <a 
                                        href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 px-3 py-1.5 rounded-xl transition-colors mt-0.5"
                                      >
                                        {T[lang].viewDetailsBtn}
                                        <ExternalLink size={12} />
                                      </a>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>

                              {totalPages > 1 && (
                                <div className="flex flex-row items-center justify-between gap-4 pt-3 border-t border-slate-100 mt-2">
                                  <span className="text-xs font-medium text-slate-500 font-sans">
                                    {T[lang].pagination.stats
                                      .replace('{start}', (startIndex + 1).toString())
                                      .replace('{end}', endIndex.toString())
                                      .replace('{total}', totalTrials.toString())}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handlePageChange(message.id, message.trials!, 'prev')}
                                      disabled={currentPage === 1 || isLoading}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 transition-all active:scale-[0.97] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <ChevronLeft size={14} />
                                      {T[lang].pagination.prev}
                                    </button>
                                    <button
                                      onClick={() => handlePageChange(message.id, message.trials!, 'next')}
                                      disabled={currentPage === totalPages || isLoading}
                                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-800 transition-all active:scale-[0.97] shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {T[lang].pagination.next}
                                      <ChevronRight size={14} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Data Tables rendering area */}
                        {message.role === 'assistant' && message.relatedTrial && expandedResponses[message.id] && (
                          <div className="space-y-4 mb-4">
                            {/* Primary Outcomes Table */}
                            {expandedResponses[message.id].has('primary_outcomes') && message.relatedTrial.resultsData?.outcomeMeasures?.some(m => m.type.toUpperCase() === 'PRIMARY') && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3">
                                 <div className="p-4 space-y-6">
                                  <h4 className="text-xs font-bold text-indigo-600 flex items-center gap-2">
                                    <BarChart3 size={14} /> {lang === 'en' ? 'Primary Outcome Measures Results' : '主要量測指標詳細結果'}
                                  </h4>
                                  {Object.entries(
                                    (message.relatedTrial.resultsData?.outcomeMeasures || [])
                                      .filter(m => m.type.toUpperCase() === 'PRIMARY')
                                      .reduce((acc, m) => {
                                        const type = m.paramType || (lang === 'en' ? 'Other Metric' : '其餘指標');
                                        if (!acc[type]) acc[type] = [];
                                        acc[type].push(m);
                                        return acc;
                                      }, {} as Record<string, any[]>)
                                  ).map(([paramType, measures]) => (
                                    <div key={paramType} className="space-y-2">
                                      <div className="flex items-center gap-2 mb-2">
                                        <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                          {lang === 'en' ? `${paramType} Grouping` : `${paramType}分類結果`}
                                        </h4>
                                      </div>
                                      <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-lg">
                                        <table className="w-full text-[10px] border-collapse min-w-[500px]">
                                          <thead>
                                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                              <th className="py-2.5 px-3 text-left font-bold border-r border-slate-200 bg-slate-100/50 min-w-[180px]">
                                                {lang === 'en' ? 'Measure Item (Unit)' : '測量項目 (單位)'}
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
                                                </td>
                                                {Array.from(new Set(measures.flatMap(ms => ms.groups?.map(g => g.id) || []))).map(groupId => (
                                                  <td key={groupId} className="py-2.5 px-3 text-center text-slate-600 font-mono">
                                                    {cl.categories?.[0]?.measurements?.find((v: any) => v.groupId === groupId)?.value || '-'}
                                                  </td>
                                                ))}
                                              </tr>
                                            )))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}

                                 {/* Import primary outcomes data button */}
                                 <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3.5 gap-2">
                                   <span className="text-[10px] text-slate-400">
                                     {lang === 'en' 
                                       ? "* Import this trial's primary outcome measures to Cache tab" 
                                       : '* 點擊按鈕可將本試驗之主要量測指標數據導入暫存區'}
                                   </span>
                                   <button
                                     onClick={() => {
                                       handleImportBoth(message.relatedTrial!);
                                       return;
                                       const alreadyCached = cachedOutcomes.some(t => t.nctId === message.relatedTrial!.nctId);
                                       if (alreadyCached) {
                                         setToast({
                                           message: lang === 'en' ? 'This trial is already in your primary outcomes cache!' : '此試驗主要指標已在暫存區！',
                                           type: 'info'
                                         });
                                       } else {
                                         setCachedOutcomes(prev => [...prev, message.relatedTrial!]); // test comment
                                         setToast({
                                           message: lang === 'en' ? 'Successfully imported to Outcomes Cache!' : '主要指標已成功導入暫存區！',
                                           type: 'success'
                                         });
                                       }
                                     }}
                                     className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97] shadow-sm self-end"
                                   >
                                     <Table size={13} />
                                     {lang === 'en' ? 'Import Data' : '導入數據'}
                                   </button>
                                 </div>
                                 </div>
                              </div>
                            )}

                            {/* Secondary Outcomes Table */}
                            {expandedResponses[message.id].has('secondary_outcomes') && message.relatedTrial.resultsData?.outcomeMeasures?.some(m => m.type.toUpperCase() === 'SECONDARY') && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3">
                                 <div className="p-4 space-y-6">
                                  <h4 className="text-xs font-bold text-blue-600 flex items-center gap-2">
                                    <BarChart3 size={14} /> {T[lang].tables.secondaryTitle}
                                  </h4>
                                  {Object.entries(
                                    (message.relatedTrial.resultsData?.outcomeMeasures || [])
                                      .filter(m => m.type.toUpperCase() === 'SECONDARY')
                                      .reduce((acc, m) => {
                                        const type = m.paramType || (lang === 'en' ? 'Other Metric' : '其餘指標');
                                        if (!acc[type]) acc[type] = [];
                                        acc[type].push(m);
                                        return acc;
                                      }, {} as Record<string, any[]>)
                                  ).map(([paramType, measures]) => (
                                    <div key={paramType} className="space-y-2">
                                      <div className="flex items-center gap-2 mb-2">
                                        <h4 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                                          {lang === 'en' ? `${paramType} Grouping` : `${paramType}分類結果`}
                                        </h4>
                                      </div>
                                      <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-lg">
                                        <table className="w-full text-[10px] border-collapse min-w-[500px]">
                                          <thead>
                                            <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                              <th className="py-2.5 px-3 text-left font-bold border-r border-slate-200 bg-slate-100/50 min-w-[180px]">
                                                {lang === 'en' ? 'Measure Item (Unit)' : '測量項目 (單位)'}
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
                                                </td>
                                                {Array.from(new Set(measures.flatMap(ms => ms.groups?.map(g => g.id) || []))).map(groupId => (
                                                  <td key={groupId} className="py-2.5 px-3 text-center text-slate-600 font-mono">
                                                    {cl.categories?.[0]?.measurements?.find((v: any) => v.groupId === groupId)?.value || '-'}
                                                  </td>
                                                ))}
                                              </tr>
                                            )))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                 </div>
                              </div>
                            )}

                            {/* Study Design Details */}
                            {expandedResponses[message.id].has('study_design') && message.relatedTrial.designInfo && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3 p-4">
                                <h4 className="text-xs font-bold text-emerald-600 flex items-center gap-2 mb-4">
                                  <Settings2 size={14} /> {T[lang].tables.studyDesignTitle}
                                </h4>
                                <div className="bg-emerald-50/30 rounded-xl p-3 border border-emerald-100/50">
                                  <ul className="space-y-2">
                                    {[
                                      { label: T[lang].tables.designLabels.studyType, value: message.relatedTrial.designInfo.studyType },
                                      { label: T[lang].tables.designLabels.phases, value: message.relatedTrial.designInfo.phases?.join(', ') },
                                      { label: T[lang].tables.designLabels.allocation, value: message.relatedTrial.designInfo.allocation },
                                      { label: T[lang].tables.designLabels.interventionModel, value: message.relatedTrial.designInfo.interventionModel },
                                      { label: T[lang].tables.designLabels.primaryPurpose, value: message.relatedTrial.designInfo.primaryPurpose },
                                      { label: T[lang].tables.designLabels.masking, value: message.relatedTrial.designInfo.maskingInfo?.masking },
                                      { label: T[lang].tables.designLabels.whoMasked, value: message.relatedTrial.designInfo.maskingInfo?.whoMasked?.join(', ') }
                                    ].filter(item => item.value).map((item, idx) => (
                                      <li key={idx} className="flex flex-col sm:flex-row sm:items-start text-[11px]">
                                        <span className="font-bold text-emerald-800 w-32 shrink-0">• {item.label}：</span>
                                        <span className="text-slate-600">{item.value}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                
                                <button 
                                  onClick={() => toggleExpansion(message.id, 'all_outcomes')}
                                  className="mt-4 w-full flex items-center justify-between py-2 text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors border-t border-slate-50"
                                >
                                  <span>{T[lang].tables.viewFullScope}</span>
                                  {expandedResponses[message.id].has('all_outcomes') ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                
                                <AnimatePresence>
                                  {expandedResponses[message.id].has('all_outcomes') && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                      <div className="space-y-4 pt-4 border-t border-slate-50">
                                        <div className="space-y-2">
                                          <p className="text-[10px] font-bold text-indigo-600 uppercase">{T[lang].tables.primaryTerm}</p>
                                          {message.relatedTrial.primaryOutcomes?.map((o, i) => (
                                            <div key={i} className="text-[10px] bg-indigo-50/50 p-2 rounded-lg">
                                              <p className="font-bold text-indigo-900">{o.measure}</p>
                                              {o.description && <p className="text-slate-500 mt-1">{o.description}</p>}
                                            </div>
                                          ))}
                                        </div>
                                        <div className="space-y-2">
                                          <p className="text-[10px] font-bold text-slate-500 uppercase">{T[lang].tables.secondaryTerm}</p>
                                          {message.relatedTrial.secondaryOutcomes?.slice(0, 5).map((o, i) => (
                                            <div key={i} className="text-[10px] bg-slate-50 p-2 rounded-lg">
                                              <p className="font-bold text-slate-700">{o.measure}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            )}

                            {/* Location Details Table */}
                            {expandedResponses[message.id].has('locations') && (message.relatedTrial.locations?.length || 0) > 0 && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3 p-4">
                                <h4 className="text-xs font-bold text-indigo-600 flex items-center gap-2 mb-4">
                                  <MapPin size={14} /> {T[lang].tables.locationTitle}
                                </h4>
                                <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-xl">
                                  <table className="w-full text-[10px] border-collapse min-w-[400px]">
                                    <thead className="bg-slate-50 text-slate-500">
                                      <tr>
                                        <th className="py-2 px-3 text-left font-bold">{T[lang].tables.facility}</th>
                                        <th className="py-2 px-3 text-left font-bold w-24">{T[lang].tables.city}</th>
                                        <th className="py-2 px-3 text-left font-bold w-24">{T[lang].tables.country}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {message.relatedTrial.locations?.map((loc, i) => (
                                        <tr key={i} className="hover:bg-slate-50/30 transition-colors">
                                          <td className="py-2 px-3 font-medium text-slate-700">{loc.facility || (lang === 'en' ? 'Facility not specified' : '未提供設施標示')}</td>
                                          <td className="py-2 px-3 text-slate-500">{loc.city}</td>
                                          <td className="py-2 px-3 font-bold text-slate-600">{loc.country}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Import other adverse events data button */}
                                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3.5 gap-2">
                                  <span className="text-[10px] text-slate-400">
                                    {lang === 'en' 
                                      ? "* Import this trial's adverse events to Cache tab" 
                                      : '* 點擊按鈕可將本試驗之不良事件統計導入暫存區'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      handleImportBoth(message.relatedTrial!);
                                      return;
                                      const alreadyCached = cachedTrials.some(t => t.nctId === message.relatedTrial!.nctId);
                                      if (alreadyCached) {
                                        setToast({
                                          message: lang === 'en' ? 'This trial is already in your cache!' : '此試驗不良事件數據已在暫存區！',
                                          type: 'info'
                                        });
                                      } else {
                                        setCachedTrials(prev => [...prev, message.relatedTrial!]);
                                        setToast({
                                          message: lang === 'en' ? 'Successfully imported to Cache!' : '不良事件數據已成功導入暫存區！',
                                          type: 'success'
                                        });
                                      }
                                    }}
                                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97] shadow-sm self-end"
                                  >
                                    <Table size={13} />
                                    {lang === 'en' ? 'Import Data' : '導入數據'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Serious Adverse Events Table */}
                            {expandedResponses[message.id].has('serious_adverse') && (message.relatedTrial.seriousEvents?.length || 0) > 0 && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3 p-4">
                                <h4 className="text-xs font-bold text-red-600 flex items-center gap-2 mb-4">
                                  <AlertTriangle size={14} /> {T[lang].tables.seriousAdverseTitle}
                                </h4>
                                <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-xl">
                                  <table className="w-full text-[10px] border-collapse min-w-[400px]">
                                    <thead className="bg-red-50 text-red-600">
                                      <tr>
                                        <th className="py-2 px-3 text-left font-bold">{T[lang].tables.term}</th>
                                        <th className="py-2 px-3 text-left font-bold">{T[lang].tables.organ}</th>
                                        <th className="py-2 px-3 text-right font-bold w-16">{T[lang].tables.times}</th>
                                        <th className="py-2 px-3 text-right font-bold w-16">{T[lang].tables.people}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {message.relatedTrial.seriousEvents?.map((e, i) => (
                                        <tr key={i} className={`hover:bg-slate-50/30 transition-colors ${i < 5 ? "bg-red-50/20" : ""}`}>
                                          <td className="py-2 px-3 font-bold text-slate-700">{e.term}</td>
                                          <td className="py-2 px-3 text-slate-500">{e.organSystem}</td>
                                          <td className="py-2 px-3 text-right font-bold text-indigo-600">{e.numEvents}</td>
                                          <td className="py-2 px-3 text-right text-slate-500">{e.numAffected}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>

                                {/* Import SAE data button */}
                                <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-3.5 gap-2">
                                  <span className="text-[10px] text-slate-400">
                                    {lang === 'en' 
                                      ? "* Import this trial's serious adverse events to SAE Cache tab" 
                                      : '* 點擊按鈕可將本試驗之嚴重不良事件統計導入暫存區'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      handleImportBoth(message.relatedTrial!);
                                      return;
                                      const alreadyCached = cachedTrials.some(t => t.nctId === message.relatedTrial!.nctId);
                                      if (alreadyCached) {
                                        setToast({
                                          message: lang === 'en' ? 'This trial is already in your cache!' : '此試驗不良事件數據已在暫存區！',
                                          type: 'info'
                                        });
                                      } else {
                                        setCachedTrials(prev => [...prev, message.relatedTrial!]);
                                        setToast({
                                          message: lang === 'en' ? 'Successfully imported to SAE Cache!' : '嚴重不良事件數據已成功導入暫存區！',
                                          type: 'success'
                                        });
                                      }
                                    }}
                                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all active:scale-[0.97] shadow-sm self-end"
                                  >
                                    <Table size={13} />
                                    {lang === 'en' ? 'Import SAE Data' : '導入數據'}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Other Adverse Events Table */}
                            {expandedResponses[message.id].has('other_adverse') && (message.relatedTrial.otherEvents?.length || 0) > 0 && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3 p-4">
                                <h4 className="text-xs font-bold text-orange-600 flex items-center gap-2 mb-4">
                                  <AlertCircle size={14} /> {T[lang].tables.otherAdverseTitle}
                                </h4>
                                <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-xl">
                                  <table className="w-full text-[10px] border-collapse min-w-[400px]">
                                    <thead className="bg-orange-50 text-orange-600">
                                      <tr>
                                        <th className="py-2 px-3 text-left font-bold">{T[lang].tables.term}</th>
                                        <th className="py-2 px-3 text-left font-bold">{T[lang].tables.organ}</th>
                                        <th className="py-2 px-3 text-right font-bold w-16">{T[lang].tables.times}</th>
                                        <th className="py-2 px-3 text-right font-bold w-16">{T[lang].tables.people}</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {message.relatedTrial.otherEvents?.map((e, i) => (
                                        <tr key={i} className={`hover:bg-slate-50/30 transition-colors ${i < 5 ? "bg-orange-50/20" : ""}`}>
                                          <td className="py-2 px-3 font-bold text-slate-700">{e.term}</td>
                                          <td className="py-2 px-3 text-slate-500">{e.organSystem}</td>
                                          <td className="py-2 px-3 text-right font-bold text-indigo-600">{e.numEvents}</td>
                                          <td className="py-2 px-3 text-right text-slate-500">{e.numAffected}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}

                            {/* References & Publications Table */}
                            {expandedResponses[message.id].has('references_publications') && (
                              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-3 p-4">
                                <h4 className="text-sm font-bold text-indigo-600 flex items-center gap-2 mb-4">
                                  <BookOpen size={15} /> {lang === 'en' ? 'References & Publications' : '相關文獻與發表文章'}
                                </h4>
                                {(!message.relatedTrial.referencesModule?.references || message.relatedTrial.referencesModule.references.length === 0) ? (
                                  <p className="text-xs text-slate-500 py-2">
                                    {lang === 'en' ? 'No references or publications found for this trial.' : '此試驗尚無登載的相關文獻或發表文章。'}
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto custom-scrollbar border border-slate-100 rounded-xl">
                                    <table className="w-full text-xs border-collapse min-w-[500px]">
                                      <thead className="bg-indigo-50/50 text-indigo-700">
                                        <tr>
                                          <th className="py-2.5 px-3 text-left font-bold w-24 border-b border-indigo-100">{lang === 'en' ? 'Type' : '文獻類型'}</th>
                                          <th className="py-2.5 px-3 text-left font-bold border-b border-indigo-100">{lang === 'en' ? 'Citation' : '引用文獻名稱'}</th>
                                          <th className="py-2.5 px-3 text-center font-bold w-28 border-b border-indigo-100">{lang === 'en' ? 'PubMed Link' : '原文網址'}</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 bg-white">
                                        {message.relatedTrial.referencesModule.references.map((ref: any, i: number) => {
                                          const pmid = ref.pmid;
                                          const pubMedUrl = pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '';
                                          return (
                                            <tr key={i} className="hover:bg-slate-50/40 transition-colors">
                                              <td className="py-3 px-3 font-semibold text-slate-600 align-top">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                  String(ref.type).toUpperCase() === 'RESULT' 
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                                    : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                  {ref.type || 'N/A'}
                                                </span>
                                              </td>
                                              <td className="py-3 px-3 text-slate-700 leading-relaxed font-normal align-top">
                                                {ref.citation || 'N/A'}
                                              </td>
                                              <td className="py-3 px-3 text-center align-top">
                                                {pmid ? (
                                                  <a
                                                    href={pubMedUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 font-semibold rounded-lg text-xs transition-colors border border-indigo-100/30 shadow-sm"
                                                  >
                                                    <span>PubMed</span>
                                                    <ExternalLink size={11} />
                                                  </a>
                                                ) : (
                                                  <span className="text-slate-400 font-mono">-</span>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Follow-up Questions Card */}
                        {!message.isLoading && message.role === 'assistant' && message.relatedTrial && (
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mt-2 shadow-sm"
                          >
                            <p className="text-xs font-bold text-slate-500 mb-3 flex items-center gap-2">
                              <Settings2 size={14} className="text-indigo-500" />
                              {T[lang].wantToKnowMore}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: T[lang].actions.study_design, id: 'study_design', icon: <Settings2 size={12} /> },
                                { label: T[lang].actions.locations, id: 'locations', icon: <MapPin size={12} /> },
                                { label: T[lang].actions.primary_outcomes, id: 'primary_outcomes', icon: <Info size={12} /> },
                                { label: T[lang].actions.secondary_outcomes, id: 'secondary_outcomes', icon: <BarChart3 size={12} /> },
                                { label: T[lang].actions.serious_adverse, id: 'serious_adverse', icon: <AlertTriangle size={12} /> },
                                { label: T[lang].actions.other_adverse, id: 'other_adverse', icon: <AlertCircle size={12} /> },
                                { label: T[lang].actions.status_dates, id: 'status_dates', icon: <Calendar size={12} /> },
                                { label: T[lang].actions.intervention_details, id: 'intervention_details', icon: <Beaker size={12} /> },
                                { label: T[lang].actions.eligibility_criteria, id: 'eligibility_criteria', icon: <ClipboardList size={12} /> },
                                { label: T[lang].actions.references_publications, id: 'references_publications', icon: <BookOpen size={12} /> },
                              ].map((action) => (
                                <button
                                  key={action.id}
                                  onClick={() => handleFollowUp(message.relatedTrial!, action.label, action.id)}
                                  disabled={isLoading}
                                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all active:scale-[0.97] shadow-sm disabled:opacity-50"
                                >
                                  <span className="text-indigo-500">{action.icon}</span>
                                  {action.label}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div 
              className="p-4 md:py-3 md:px-6 bg-transparent mx-auto flex flex-col justify-center shrink-0 w-full"
              style={{ width: '874.227px', height: '115px', maxWidth: '100%' }}
            >
              <div className="w-full relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder={rateLimitInfo.limited ? (lang === 'zh' ? `已達呼叫上限！請在大約 ${Math.ceil(rateLimitInfo.timeLeftMs / 1000)} 秒後再試` : `Limit Reached! Please try again in about ${Math.ceil(rateLimitInfo.timeLeftMs / 1000)}s`) : T[lang].inputPlaceholder}
                  className={`w-full pl-6 pr-24 rounded-2xl border transition-all text-sm bg-white shadow-md ${rateLimitInfo.limited ? 'border-amber-200 focus:border-amber-400 focus:ring-amber-50 cursor-not-allowed bg-slate-50' : 'border-slate-200 hover:border-slate-300 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100'}`}
                  style={{ height: '48px' }}
                  disabled={isLoading || rateLimitInfo.limited}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  {isLoading ? (
                    <button
                      onClick={handleAbort}
                      className="flex items-center justify-center bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors text-xs font-bold shadow-sm active:scale-95 border border-red-100 shrink-0"
                      style={{ height: '35px', width: '35px' }}
                      title={T[lang].abortBtn}
                    >
                      <Square size={13} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim() || rateLimitInfo.limited}
                      className={`flex items-center justify-center rounded-xl transition-all shadow-indigo-100 shrink-0 ${
                        !input.trim() || rateLimitInfo.limited
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105 shadow-lg active:scale-95'
                      }`}
                      style={{ height: '35px', width: '35px' }}
                    >
                      <Send size={15} />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-center text-[10px] text-slate-400 mt-2 mx-auto leading-relaxed" style={{ width: '530px', maxWidth: '100%' }}>
                {T[lang].footerNotice}
              </p>
            </div>
          </>
        ) : activeTab === 'efficacy' ? (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {/* Subtab Segmented Toggles */}
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-2 flex items-center justify-between gap-4 shrink-0 shadow-xs">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                  {lang === 'en' ? 'Efficacy Analytics Workspace' : '療效統合分析工作區'}
                </span>
              </div>
              <div className="flex bg-slate-200/50 p-0.5 rounded-xl border border-slate-200/70">
                <button
                  onClick={() => setEfficacySubTab('raw')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    efficacySubTab === 'raw'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {lang === 'en' ? 'Primary Outcomes Raw Data' : '主要指標原始數據'}
                </button>
                <button
                  onClick={() => setEfficacySubTab('meta')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    efficacySubTab === 'meta'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {lang === 'en' ? 'Primary Outcomes Meta-Analysis' : '主要指標統合分析'}
                </button>
              </div>
            </div>

            {/* Contents panel */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {efficacySubTab === 'raw' ? (
                <PrimaryOutcomesCache
                  cachedTrials={cachedOutcomes}
                  onRemoveTrials={(nctIds) => {
                    setCachedOutcomes(prev => prev.filter(t => !nctIds.includes(t.nctId)));
                    setCachedTrials(prev => prev.filter(t => !nctIds.includes(t.nctId)));
                    setToast({
                      message: lang === 'en' ? 'Selected trials deleted from both caches.' : '已同步從兩個分頁中刪除選取的試驗數據。',
                      type: 'info'
                    });
                  }}
                  onClearAll={() => {
                    setCachedOutcomes([]);
                    setCachedTrials([]);
                    setToast({
                      message: lang === 'en' ? 'All cached data cleared from both caches.' : '已重置並清空所有暫存數據。',
                      type: 'success'
                    });
                  }}
                  lang={lang}
                />
              ) : (
                <MetaAnalysisTool
                  saeCachedTrials={cachedTrials}
                  outcomesCachedTrials={cachedOutcomes}
                  lang={lang}
                  forcedAnalysisMode="outcomes"
                  hideModeSelector={true}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
            {/* Subtab Toggles */}
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-2 flex items-center justify-between gap-4 shrink-0 shadow-xs">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                  {lang === 'en' ? 'Safety / Adverse Events Workspace' : '安全性不良事件分析工作區'}
                </span>
              </div>
              <div className="flex bg-slate-200/50 p-0.5 rounded-xl border border-slate-200/70">
                <button
                  onClick={() => setSafetySubTab('raw')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    safetySubTab === 'raw'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {lang === 'en' ? 'Adverse Events Raw Data' : '不良事件原始數據'}
                </button>
                <button
                  onClick={() => setSafetySubTab('meta')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    safetySubTab === 'meta'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {lang === 'en' ? 'Adverse Events Meta-Analysis' : '不良事件統合分析'}
                </button>
              </div>
            </div>

            {/* Contents panel */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {safetySubTab === 'raw' ? (
                <AdverseEventsCache
                  cachedTrials={cachedTrials}
                  onRemoveTrials={(nctIds) => {
                    setCachedTrials(prev => prev.filter(t => !nctIds.includes(t.nctId)));
                    setCachedOutcomes(prev => prev.filter(t => !nctIds.includes(t.nctId)));
                    setToast({
                      message: lang === 'en' ? 'Selected trials deleted from both caches.' : '已同步從兩個分頁中刪除選取的試驗數據。',
                      type: 'info'
                    });
                  }}
                  onClearAll={() => {
                    setCachedTrials([]);
                    setCachedOutcomes([]);
                    setToast({
                      message: lang === 'en' ? 'All cached data cleared from both caches.' : '已重置並清空所有暫存數據。',
                      type: 'success'
                    });
                  }}
                  lang={lang}
                />
              ) : (
                <MetaAnalysisTool
                  saeCachedTrials={cachedTrials}
                  outcomesCachedTrials={cachedOutcomes}
                  lang={lang}
                  forcedAnalysisMode="sae"
                  hideModeSelector={true}
                />
              )}
            </div>
          </div>
        )}

        {/* Visual Toast Notification standard */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              className="fixed top-20 right-4 sm:right-8 z-50 pointer-events-none"
            >
              <div className={`p-4 rounded-2xl shadow-xl flex items-center gap-2 border text-xs font-bold ${
                toast.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100/50'
                  : toast.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-200 shadow-red-100/50'
                  : 'bg-indigo-50 text-indigo-800 border-indigo-200 shadow-indigo-100/50'
              }`}>
                <Info size={14} className={toast.type === 'success' ? 'text-emerald-500' : 'text-indigo-500'} />
                {toast.message}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gemini Rate Limit Dialog Alert Modal */}
        <AnimatePresence>
          {rateLimitInfo.limited && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 md:bg-slate-900/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center relative overflow-hidden pointer-events-auto"
              >
                {/* Decorative Amber Warning Ring */}
                <div className="absolute top-0 inset-x-0 h-2 bg-amber-500" />
                
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100 animate-pulse">
                  <AlertCircle size={32} className="text-amber-500" />
                </div>
                
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {lang === 'zh' ? '已達到 AI 呼叫上限' : 'AI Request Limit Reached'}
                </h3>
                
                <p className="text-sm text-slate-500 mb-6 leading-relaxed">
                  {lang === 'zh' 
                    ? `由於 Gemini 模型的使用頻率已達上限，系統此時暫不處理對話，以維護服務品質。\n預計幾分鐘後解除限制，您可於下方倒數完成後再次使用。`
                    : `To protect service performance, dialogue flows are temporarily restricted due to intense API usage.\nEstimated retry: in a few minutes, after the countdown finishes below.`}
                </p>

                {/* Countdown display */}
                <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6 flex flex-col items-center justify-center">
                  <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">
                    {lang === 'zh' ? '預期解鎖倒數' : 'Expected Unlock Countdown'}
                  </div>
                  <div className="text-2xl font-mono font-bold text-amber-600">
                    {(() => {
                      const totalSec = Math.ceil(rateLimitInfo.timeLeftMs / 1000);
                      const displayMinutes = Math.floor(totalSec / 60);
                      const s = totalSec % 60;
                      return displayMinutes > 0 
                        ? `${displayMinutes} 分 ${s} 秒 (${displayMinutes}m ${s}s)`
                        : `${s} 秒 (${s}s)`;
                    })()}
                  </div>
                </div>

                <button
                  onClick={() => {
                    // Triggers helpful notification closing block state
                    setToast({
                      message: lang === 'zh' ? '輸入框已鎖定，待倒數結束解鎖。' : 'Input locked. Restored when countdown expires.',
                      type: 'info'
                    });
                  }}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] transition-all text-white rounded-2xl font-bold text-sm shadow-md shadow-amber-500/20"
                >
                  {lang === 'zh' ? '我知道了 (Acknowledge)' : 'Acknowledge'}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  </div>
  );
}
