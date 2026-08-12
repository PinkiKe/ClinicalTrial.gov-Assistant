import { GoogleGenAI, Type } from "@google/genai";
import { ApiQuery, Trial } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class GeminiRateLimitError extends Error {
  status = 429;
  retryAfterMs = 60000;
  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'GeminiRateLimitError';
    if (retryAfterMs !== undefined) {
      this.retryAfterMs = retryAfterMs;
    }
  }
}

export function isQuotaError(error: any): boolean {
  if (!error) return false;
  const errMsg = String(error.message || error);
  return (
    error.status === 429 ||
    error.statusCode === 429 ||
    errMsg.includes("429") ||
    errMsg.includes("Quota exceeded") ||
    errMsg.includes("ResourceExhausted") ||
    errMsg.includes("RESOURCE_EXHAUSTED") ||
    errMsg.includes("LimitExceeded") ||
    errMsg.includes("limit: 20")
  );
}

export function parseRetryAfterMs(error: any): number {
  if (!error) return 60000;
  const errMsg = String(error.message || error);
  
  const docRetryMatch = errMsg.match(/Please retry in\s+([0-9.]+)\s*s/i);
  if (docRetryMatch && docRetryMatch[1]) {
    const secs = parseFloat(docRetryMatch[1]);
    if (!isNaN(secs) && secs > 0) {
      return Math.ceil(secs * 1000);
    }
  }

  try {
    const jsonStartIdx = errMsg.indexOf('{');
    if (jsonStartIdx !== -1) {
      const jsonStr = errMsg.slice(jsonStartIdx);
      const parsed = JSON.parse(jsonStr);
      const details = parsed?.error?.details || parsed?.details;
      if (Array.isArray(details)) {
        for (const detail of details) {
          if (detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo') {
            const delay = detail.retryDelay;
            if (typeof delay === 'string') {
              const num = parseFloat(delay);
              if (!isNaN(num)) return Math.ceil(num * 1000);
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  return 60000;
}

export function handleServerGeminiException(error: any) {
  if (isQuotaError(error)) {
    const ms = parseRetryAfterMs(error);
    throw new GeminiRateLimitError(error.message || "Quota Exceeded", ms);
  }
}

async function generateContentWithFallback(
  params: Omit<Parameters<typeof ai.models.generateContent>[0], 'model'> & { model?: string }
) {
  const primaryModel = params.model || "gemini-3.5-flash";
  const fallbackModel = "gemini-3.1-flash-lite";

  try {
    return await ai.models.generateContent({
      ...params,
      model: primaryModel,
    });
  } catch (error: any) {
    const errorStr = String(error?.message || error);
    const is503 = errorStr.includes("503") || errorStr.includes("UNAVAILABLE") || errorStr.includes("high demand") || errorStr.includes("Service Unavailable");
    const isQuota = isQuotaError(error);

    if ((is503 || isQuota) && primaryModel !== fallbackModel) {
      const reasonLabel = is503 ? "temporarily busy" : "quota limit";
      console.log(`[Gemini] Switching from ${primaryModel} to ${fallbackModel} (reason: ${reasonLabel})`);
      try {
        return await ai.models.generateContent({
          ...params,
          model: fallbackModel,
        });
      } catch (fallbackError: any) {
        console.error(`[Gemini] Fallback model ${fallbackModel} encountered issue:`, fallbackError.message || fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}

export type QueryIntent = 'search' | 'chat' | 'results_lookup';

export interface ParsedQuery extends ApiQuery {
  intent: QueryIntent;
  nctId?: string;
  nctIds?: string[];
}


export async function parseQuery(userInput: string): Promise<ParsedQuery> {
  const prompt = `
    分析以下使用者查詢，並判斷其意圖。
    使用者查詢："${userInput}"
    
    意圖類別：
    1. 「search」：搜尋特定疾病、地點或一般臨床試驗。
       * 當一個問句中出現多個 NCT ID 時，請直接進入「search」意圖，並將所有提取出的 NCT ID 填入 nctIds 陣列中。
       * ⚠️ 意圖預設：如果使用者沒有使用任何「請幫我找...」、「我想要...」等起手語句，直接輸入試驗條件或關鍵字時，請直接判定意圖為「search」。
       * ⚠️ 注意：當 intent 為 search 或 chat 時，請勿輸出 category 欄位（請勿包含在 JSON 中）。
    2. 「results_lookup」：使用者明確提到單一特定的 NCT ID (例如 NCT03548935) 並詢問其「結果」、「設計」、「數據」、「內容」、「發展」或特定的細節欄位。
    3. 「chat」：一般問候、藥物科普諮詢或非特定試驗的日常對談。
    
    如果是 「results_lookup」，請判斷是否對應以下特定類別 (category)：
    - study_design: 關於試驗設計、方法、計畫、研究類型、階段、分配、模型、目的、遮盲。
    - locations: 關於試驗地點、機構、醫院、設施、在哪裡、試驗單位。
    - primary_outcomes: 關於主要量測指標、主要指標、主要測量、主要結果、主要數據、Primary。
    - secondary_outcomes: 關於次要量測指標、次要指標、次要測量、次要結果、Secondary。
    - serious_adverse: 關於嚴重不良事件、安全性問題、SAE、中毒、嚴重副作用。
    - other_adverse: 關於其他不良事件、一般副作用、不良反应、副作用。
    - status_dates: 關於試驗的日期資訊、年份、開始時間、預計完成時間、實際/預計主要完成時間、更新時間、執行期間。
    
    如果使用者意圖是「search」，請根據以下指示提取：

    ==================== 特殊規定用詞標準化辭典 (Dictionary) ====================
    請嚴格將中文口語映射為以下帶有 AREA 語法的 API 專用值。若使用者未提及，對應陣列必須保持為空 []，字串欄位則保持空字串 ""。
    ⚠️注意：除了 status 保持原樣之外，其餘陣列皆須包含 AREA[分類] 前綴。
    
    【status 招募狀態】(保持原樣，不加 AREA)
    - 進行中但不招募 -> ACTIVE_NOT_RECRUITING
    - 已完成 -> COMPLETED
    - 憑邀請招募 -> ENROLLING_BY_INVITATION
    - 尚未開始招募 -> NOT_YET_RECRUITING
    - 招募中 / 正在招募 -> RECRUITING
    - 暫停 -> SUSPENDED
    - 終止 -> TERMINATED
    - 撤回 -> WITHDRAWN

    【phase 試驗階段】
    - 第一期 / 一期 / Phase 1 -> AREA[Phase]PHASE1
    - 第二期 / 二期 / Phase 2 -> AREA[Phase]PHASE2
    - 第三期 / 三期 / Phase 3 -> AREA[Phase]PHASE3
    - 第四期 / 四期 / Phase 4 -> AREA[Phase]PHASE4
    - 早期第一期 -> AREA[Phase]EARLY_PHASE1

    【designAllocation & interventionalAssignment 分配方式】
    - 隨機分配 -> AREA[DesignAllocation]RANDOMIZED
    - 非隨機分配 -> AREA[DesignAllocation]NON_RANDOMIZED
    - 單組/平行/交叉/階乘/順序 -> 對應 AREA[InterventionalAssignment] 後接 SINGLE_GROUP / PARALLEL / CROSSOVER / FACTORIAL / SEQUENTIAL

    【designMasking 遮盲設計】
    - 只要提到「無遮盲/開放標籤」-> AREA[DesignMasking]NONE
    - 只要提到「單盲/雙盲/三盲/四盲」-> 分別填入對應的 AREA[DesignMasking]SINGLE / AREA[DesignMasking]DOUBLE / AREA[DesignMasking]TRIPLE / AREA[DesignMasking]QUADRUPLE

    【standardAge 年齡類別】
    - 17 歲以下 (兒童/嬰幼兒) -> AREA[StandardAge]CHILD
    - 18 至 64 歲 (成人) -> AREA[StandardAge]ADULT
    - 65 歲以上 (高齡/老人) -> AREA[StandardAge]OLDER_ADULT

    【dateRange 發布日期區間】
    - 若使用者提到特定的年份範圍 (例如 2022-2023年)，請輸出 "AREA[LastUpdatePostDate]RANGE[2022,2023]"
    - 若使用者提到某年份之前 (例如 2023年之前)，請輸出 "AREA[LastUpdatePostDate]RANGE[MIN,2023]"
    - 若使用者提到某年份之後 (例如 2023年到現在/至今)，請輸出 "AREA[LastUpdatePostDate]RANGE[2023,MAX]"

    【sort 排序條件】
    - 若提到「最新的試驗」、「最新發布」、「最近更新」或「從新到舊排序」 -> 填入 "LastUpdatePostDate:desc"

    ==================== 一般提取與翻譯規則 (Extraction & Translation) ====================
    1. 過濾冗詞：忽略「請幫我找」、「有沒有關於...的試驗」等口語。
    2. 英文翻譯：cond(疾病狀況)、term(通用關鍵字)、locn(地點)、intr(介入/藥物)、outc(測量結果)、titles(試驗標題) 必須翻譯為英文。
    3. 避免重複：已歸類至 phase、status 等陣列的條件，絕對不可重複寫入 term 或 cond。
    4. 條件分類與上下文識別 (Contextual Classification & Extraction)：
       - 若提及「作為治療方案」、「干預措施為」、「使用藥物...」、「給予...環境」、「以...治療/干預」，提取至 intr 欄位並翻譯成英文。
       - 若提及「用於治療二型糖尿病」、「用於...疾病/症狀」，提取至 cond 欄位並翻譯成英文。
       - 若提及「試驗測量結果與...相關」、「測量指標為...」，提取至 outc 欄位並翻譯成英文。
       - 若明確指定「試驗標題為...的試驗」，提取至 titles 欄位並翻譯成英文（例如：「幫我找試驗標題為STEP的試驗」 -> titles="STEP"）。
    5. 關鍵字 Fallback (防呆機制)：如果使用者詢問的問題中有任何字詞「無法明確對應到上述任何一個篩選項目」，且非特殊用字（難以判斷是標題還是藥物，例如「幫我找STEP試驗」），請一律將該字詞翻譯成英文後，直接放入 term 欄位中搜尋。
    6. 嚴禁醫學常識通靈：即使使用者提到「用藥」、「治療」，只要沒有明確說出「介入性研究」，studyType 絕對保持空陣列 []。

    ==================== 情境範例 (Few-Shot) ====================
    範例 1：綜合條件與最新、時間範圍、模糊關鍵字
    輸入：我想搜尋2022-2023年的最新的第二期雙盲試驗，以 Semaglutide 作為用藥，且包含STEP試驗
    輸出：
    {
      "intent": "search", "cond": "", "intr": "Semaglutide", "outc": "", "titles": "", "term": "STEP",
      "dateRange": "AREA[LastUpdatePostDate]RANGE[2022,2023]", "sort": "LastUpdatePostDate:desc",
      "designMasking": ["AREA[DesignMasking]DOUBLE"],
      "phase": ["AREA[Phase]PHASE2"], 
      "status": [], "aggFilters": ""
    }
  `;

  try {
    const response = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: { type: Type.STRING, enum: ["search", "chat", "results_lookup"] },
            nctId: { type: Type.STRING },
            nctIds: { type: Type.ARRAY, items: { type: Type.STRING } },
            category: { type: Type.STRING, enum: ["study_design", "locations", "primary_outcomes", "secondary_outcomes", "serious_adverse", "other_adverse", "status_dates"] },
            cond: { type: Type.STRING, description: "醫療狀況或疾病（翻譯為英文）。" },
            term: { type: Type.STRING, description: "通用關鍵字（翻譯為英文）。無法歸類的詞彙（如不明確的試驗代號）請放入此。" },
            locn: { type: Type.STRING, description: "地點（翻譯為英文）。" },
            intr: { type: Type.STRING, description: "介入措施或藥物（翻譯為英文）。" },
            outc: { type: Type.STRING, description: "測量結果或指標（翻譯為英文）。例如：'weight'。" },
            titles: { type: Type.STRING, description: "明確指定的試驗標題（翻譯為英文）。" },
            dateRange: { type: Type.STRING, description: "發布時間範圍語法。例如：'AREA[LastUpdatePostDate]RANGE[2022,2023]'" },
            
            phase: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[Phase]EARLY_PHASE1", "AREA[Phase]PHASE1", "AREA[Phase]PHASE2", "AREA[Phase]PHASE3", "AREA[Phase]PHASE4", "AREA[Phase]NA"] }
            },
            status: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["ACTIVE_NOT_RECRUITING", "COMPLETED", "ENROLLING_BY_INVITATION", "NOT_YET_RECRUITING", "RECRUITING", "SUSPENDED", "TERMINATED", "WITHDRAWN", "AVAILABLE", "NO_LONGER_AVAILABLE", "TEMPORARILY_NOT_AVAILABLE", "APPROVED_FOR_MARKETING", "WITHHELD", "UNKNOWN"] }
            },
            designAllocation: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[DesignAllocation]RANDOMIZED", "AREA[DesignAllocation]NON_RANDOMIZED", "AREA[DesignAllocation]NA"] }
            },
            interventionalAssignment: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[InterventionalAssignment]SINGLE_GROUP", "AREA[InterventionalAssignment]PARALLEL", "AREA[InterventionalAssignment]CROSSOVER", "AREA[InterventionalAssignment]FACTORIAL", "AREA[InterventionalAssignment]SEQUENTIAL"] }
            },
            designMasking: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[DesignMasking]NONE", "AREA[DesignMasking]SINGLE", "AREA[DesignMasking]DOUBLE", "AREA[DesignMasking]TRIPLE", "AREA[DesignMasking]QUADRUPLE"] }
            },
            observationalModel: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[ObservationalModel]COHORT", "AREA[ObservationalModel]CASE_CONTROL", "AREA[ObservationalModel]CASE_ONLY", "AREA[ObservationalModel]CASE_CROSSOVER", "AREA[ObservationalModel]ECOLOGIC_OR_COMMUNITY", "AREA[ObservationalModel]FAMILY_BASED", "AREA[ObservationalModel]DEFINED_POPULATION", "AREA[ObservationalModel]NATURAL_HISTORY", "AREA[ObservationalModel]OTHER"] }
            },
            primaryPurpose: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[PrimaryPurpose]TREATMENT", "AREA[PrimaryPurpose]PREVENTION", "AREA[PrimaryPurpose]DIAGNOSTIC", "AREA[PrimaryPurpose]ECT", "AREA[PrimaryPurpose]SUPPORTIVE_CARE", "AREA[PrimaryPurpose]SCREENING", "AREA[PrimaryPurpose]HEALTH_SERVICES_RESEARCH", "AREA[PrimaryPurpose]BASIC_SCIENCE", "AREA[PrimaryPurpose]DEVICE_FEASIBILITY", "AREA[PrimaryPurpose]OTHER"] }
            },
            studyType: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[StudyType]EXPANDED_ACCESS", "AREA[StudyType]INTERVENTIONAL", "AREA[StudyType]OBSERVATIONAL"] }
            },
            armGroupType: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[ArmGroupType]EXPERIMENTAL", "AREA[ArmGroupType]ACTIVE_COMPARATOR", "AREA[ArmGroupType]PLACEBO_COMPARATOR", "AREA[ArmGroupType]SHAM_COMPARATOR", "AREA[ArmGroupType]NO_INTERVENTION", "AREA[ArmGroupType]OTHER"] }
            },
            interventionType: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[InterventionType]BEHAVIORAL", "AREA[InterventionType]BIOLOGICAL", "AREA[InterventionType]COMBINATION_PRODUCT", "AREA[InterventionType]DEVICE", "AREA[InterventionType]DIAGNOSTIC_TEST", "AREA[InterventionType]DIETARY_SUPPLEMENT", "AREA[InterventionType]DRUG", "AREA[InterventionType]GENETIC", "AREA[InterventionType]PROCEDURE", "AREA[InterventionType]RADIATION", "AREA[InterventionType]OTHER"] }
            },
            standardAge: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING, enum: ["AREA[StandardAge]CHILD", "AREA[StandardAge]ADULT", "AREA[StandardAge]OLDER_ADULT"] }
            },
            sort: { type: Type.STRING, enum: ["LastUpdatePostDate:desc"], description: "排序條件。若提到「最新」填入 'LastUpdatePostDate:desc'，否則不填。" },
            aggFilters: { type: Type.STRING, enum: ["results:with", "results:without"], description: "數據篩選。若要包含數據/結果填 'results:with'，不包含數據填 'results:without'，否則不填。" }
          },
          required: [
            "intent", "nctId", "nctIds", "cond", "term", "locn", "intr", "outc", 
            "titles", "dateRange",
            "phase", "status", "designAllocation", "interventionalAssignment",
            "designMasking", "observationalModel", "primaryPurpose", "studyType",
            "armGroupType", "interventionType", "standardAge"
          ]
        }
      }
    });

    const text = response.text;
    if (!text) return { intent: 'chat' };
    return JSON.parse(text) as ParsedQuery;
  } catch (error) {
    console.error('Error parsing query with Gemini Server:', error);
    handleServerGeminiException(error);
    return { intent: 'chat', term: userInput }; 
  }
}


export async function summarizeTrial(trial: Trial, lang: 'zh' | 'en' = 'zh'): Promise<string> {
  const isEn = lang === 'en';
  
  const prompt = isEn ? `
    You are a professional clinical trial expert. Please provide a clear summary of the following clinical trial from simple to deep concepts.
    Focus on:
    1. The core objective of the trial (Brief Summary).
    2. The main treatments or interventions involved.
    
    Trial Information:
    Title: ${trial.briefTitle}
    Condition: ${trial.conditions.join(', ')}
    Interventions: ${trial.interventions?.map(i => i.name).join(', ')}
    Summary: ${trial.summary}

    Please make sure to reply in English. Keep the tone warm and easy to understand. There is no need to include extremely detailed results data unless relevant.
  ` : `
    你是一位專業的臨床試驗專家。請針對以下試驗提供一個由簡入深的摘要回答。
    摘要應專注於：
    1. 試驗的核心目標 (Brief Summary)。
    2. 涉及的主要治療或介入方式。
    
    試驗資訊：
    標題：${trial.briefTitle}
    疾病：${trial.conditions.join(', ')}
    介入治療：${trial.interventions?.map(i => i.name).join(', ')}
    摘要：${trial.summary}

    請務必使用中文回答，語氣要親切且易於理解。不需要包含詳細的結果數據。
  `;

  try {
    const response = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        // 在生成自然語言對話時，不要使用 0。
        // 給予一點溫度 (0.2 ~ 0.4) 讓模型有空間組織更流暢的語言
        temperature: 0.3, 
      }
    });
    
    return response.text || (isEn ? "Failed to generate summary." : "無法生成摘要。");
  } catch (error) {
    console.error('Error summarizing trial with Gemini Server:', error);
    handleServerGeminiException(error);
    return isEn ? "Error occurred during summary generation." : "生成摘要時發生錯誤。";
  }
}

export async function chatAboutTrials(userInput: string, trials: Trial[], lang: 'zh' | 'en' = 'zh'): Promise<string> {
  const isEn = lang === 'en';
  const trialContext = trials.length > 0 ? trials.map(t => {
    let context = `- ${t.briefTitle} (ID: ${t.nctId}): ${t.summary}`;
    context += ` | Primary outcome measures planned: ${JSON.stringify(t.primaryOutcomes)}`;
    
    // Add study design info
    if (t.designInfo) {
      context += ` | Study design: Type=${t.designInfo.studyType}, Phase=${t.designInfo.phases?.join('/')}, Allocation=${t.designInfo.allocation}, Model=${t.designInfo.interventionModel}, Purpose=${t.designInfo.primaryPurpose}, Masking=${t.designInfo.maskingInfo?.masking}`;
    }

    // Add secondary outcomes if available, limited to first 10 to prevent bloat
    if (t.secondaryOutcomes && t.secondaryOutcomes.length > 0) {
      const topSecondary = t.secondaryOutcomes.slice(0, 10);
      context += ` | Secondary outcome measures planned (top 10): ${JSON.stringify(topSecondary)}`;
      if (t.secondaryOutcomes.length > 10) {
        context += ` | (Note: There are ${t.secondaryOutcomes.length - 10} more secondary outcomes not listed)`;
      }
    }

    context += ` | Has Results: ${t.hasResults ? 'Yes' : 'No'}`;
    
    if (t.resultsData?.outcomeMeasures) {
      const primaryResults = t.resultsData.outcomeMeasures.filter(m => m.type === 'PRIMARY' || m.type === 'Primary');
      const secondaryResults = t.resultsData.outcomeMeasures.filter(m => m.type === 'SECONDARY' || m.type === 'Secondary').slice(0, 5);
      
      context += ` | Actual primary results data: ${JSON.stringify(primaryResults)}`;
      if (secondaryResults.length > 0) {
        context += ` | Actual secondary results data (top 5): ${JSON.stringify(secondaryResults)}`;
      }
    }

    if (t.seriousEvents && t.seriousEvents.length > 0) {
      const topSerious = t.seriousEvents.slice(0, 10).map((e: any) => ({
        term: e.term,
        organSystem: e.organSystem,
        numEvents: e.numEvents,
        numAffected: e.numAffected
      }));
      context += ` | Serious adverse events (top 10): ${JSON.stringify(topSerious)}`;
      if (t.seriousEvents.length > 10) {
        context += ` | (Note: There are ${t.seriousEvents.length - 10} more serious events)`;
      }
    }

    if (t.otherEvents && t.otherEvents.length > 0) {
      const topOther = t.otherEvents.slice(0, 10).map((e: any) => ({
        term: e.term,
        organSystem: e.organSystem,
        numEvents: e.numEvents,
        numAffected: e.numAffected
      }));
      context += ` | Other adverse events (top 10): ${JSON.stringify(topOther)}`;
      if (t.otherEvents.length > 10) {
        context += ` | (Note: There are ${t.otherEvents.length - 10} more other adverse events)`;
      }
    }

    // Add trial locations info
    if (t.locations && t.locations.length > 0) {
      const topLocations = t.locations.slice(0, 10);
      context += ` | Trial locations (top 10): ${JSON.stringify(topLocations)}`;
      if (t.locations.length > 10) {
        context += ` | (Note: There are ${t.locations.length - 10} more locations not listed)`;
      }
    }

    // Add status/dates info
    if (t.statusModule) {
      context += ` | Trial date and status details (statusModule): ${JSON.stringify(t.statusModule)}`;
    }

    // Add arms interventions info (groups & treatments)
    if (t.armsInterventionsModule) {
      context += ` | Arms and Interventions details (armsInterventionsModule): ${JSON.stringify(t.armsInterventionsModule)}`;
    }

    // Add eligibility details (inclusion/exclusion criteria)
    if (t.eligibilityModule) {
      context += ` | Eligibility criteria details (eligibilityModule): ${JSON.stringify(t.eligibilityModule)}`;
    }

    // Add references and publications (referencesModule)
    if (t.referencesModule) {
      context += ` | References and publications details (referencesModule): ${JSON.stringify(t.referencesModule)}`;
    }

    return context;
  }).join('\n') : (isEn ? "No relevant clinical trial information found currently." : "目前沒有找到相關的臨床試驗資訊。");

  const prompt = isEn ? `
    You are a professional clinical trial and medical health assistant. Your name is "Clinical Trial Smart Assistant".
    
    Your task:
    1. **Clinical Trial Answering**: If the user asks about "primary outcomes", "secondary outcomes", "study design/methods", "serious or other adverse events", "locations", "results data/findings", or "trial dates (years, start/completion times, update dates)", please analyze them based on the "Trial Info (Context)" below.
       - **About dates and timelines**: Directly read from \`statusModule\`, e.g. \`startDateStruct\` (start date), \`primaryCompletionDateStruct\`, \`completionDateStruct\`, \`lastUpdateSubmitDate\` (last updated date), etc. Clearly explain the significance of these milestones to the user.
       - If asked about secondary outcomes, study design, location, or adverse events, list the most important aspects.
       - **Important Limitation**: If some items are not fully listed in the context, add a note: "Due to length limitations, this is a prioritized summary. You can expand the details on the trial cards (e.g. Outcomes, Adverse Events, Locations) to view the complete list."
       - If actual results are present (HasResults is true), analyze and summarize primary/secondary outcomes and adverse event rates.
    2. **General health/drug consultation**: If the user asks about general drug introductions, health education, or anything unrelated to the trials context, use "Google Search (grounding)" to get up-to-date and accurate information.
    3. **Friendly conversation**: For general greetings, reply warmly and specify how you can assist the user.
    4. **Language restriction**: All answers MUST be in English.
    
    Trial Info (Context):
    ${trialContext}
    
    Current Conversation:
    User: ${userInput}
    Assistant:
  ` : `
    你是一位專業的臨床試驗與醫療健康助手。你的名字是「臨床試驗智慧助手」。
    
    你的任務：
    1. **臨床試驗回答**：如果使用者詢問關於「主要量測指標」、「次要量測指標」、「試驗設計/方法」、「嚴重或其它不良事件」、「試驗地點」、「結果數據/試驗發現」或「試驗相關日期（年份、開始/完成時間、更新日期）」，請根據下方的「試驗資訊」進行解讀。
       - **關於日期與年份**：請深入讀取試驗資訊中的 \`statusModule\`。那裡包含 \`startDateStruct\` (開始日期)、\`primaryCompletionDateStruct\` (主要完成日期)、\`completionDateStruct\` (預計完成日期)、\`lastUpdateSubmitDate\` (最後更新日期) 等。請明確告知使用者這些日期的意義（例如：試驗是在何時開始、何時預計完成）。
       - 如果詢問次要指標、試驗設計、試驗地點、嚴重不良事件或其它不良事件，請明確列出計畫中或已發生的重點內容。
       - **重要限制**：若下方的指標、地點或事件標註有「未列出」的部分，請在回答末尾告知使用者：「由於項目較多，以上為重點摘要。您可以點擊試驗卡片上的對應展開按鈕（如『量測指標』、『不良事件』、『試驗地點』）查看完整清單。」
       - 如果有實際結果（HasResults 為 true），請詳細解讀並總結 PRIMARY、SECONDARY 的數據以及不良事件比例。
    2. **一般健康/藥物諮詢**：如果使用者詢問的是一般藥物介紹、健康衛教、日常對話或任何與下方試驗上下文無關的問題，請使用「網路搜尋 (Google Search)」功能來獲取最新且準確的資訊進行回答。
    3. **親切對答**：對於日常問候，請親切地回應並說明你可以如何協助使用者。
    4. **語言限制**：所有回答必須使用繁體中文。
    
    找到的試驗資訊（上下文）：
    ${trialContext}
    
    目前的對話內容（請根據此進行回應）：
    使用者：${userInput}
    助手：
  `;

  try {
    // Attempt with Google Search Grounding first (highly reliable but prone to quota restricts)
    const response = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text || (isEn ? "Sorry, I can't answer this question right now." : "抱歉，我現在無法回答這個問題。");
  } catch (error: any) {
    console.log('[Gemini] Search grounding query encountered issue. Attempting fallback without googleSearch tool...');
    try {
      // Fallback: standard prompt without any tools to bypass search rate-limits / search service quotas
      const response = await generateContentWithFallback({
        model: "gemini-3.5-flash",
        contents: prompt,
      });
      return response.text || (isEn ? "Sorry, I can't answer this question right now." : "抱歉，我現在無法回答這個問題。");
    } catch (fallbackError: any) {
      console.error('[Gemini] Both search and searchless prompts encountered issues:', fallbackError.message || fallbackError);
      handleServerGeminiException(fallbackError);
      return isEn ? "Sorry, an error occurred while processing your request." : "抱歉，處理您的請求時發生錯誤。";
    }
  }
}

export async function analyzeCohort(
  trials: Trial[], 
  lang: 'zh' | 'en' = 'zh',
  options?: {
    endpointType?: string;
    effectMetric?: string;
    poolingModel?: string;
    customDataSummary?: string;
    pooledStats?: string;
  }
): Promise<string> {
  const isEn = lang === 'en';
  
  if (!trials || trials.length === 0) {
    return isEn 
      ? "No trials selected for Meta-Analysis." 
      : "尚未選取用於統合分析的臨床試驗。";
  }

  // Build high-density clinical data profiles of selected trials
  const trialsSummary = trials.map(t => {
    let summary = `NCT ID: ${t.nctId}
Brief Title: ${t.briefTitle}
Recruitment Status: ${t.status}
Study Phase: ${t.phase?.join(', ') || 'N/A'}
Target Conditions: ${t.conditions?.join('; ')}
Tested Interventions: ${(t.interventions || []).map(i => `[${i.type}] ${i.name}`).join('; ') || 'None'}`;

    if (t.designInfo) {
      summary += `
Study Design Details: Study Type: ${t.designInfo.studyType || 'N/A'}, Allocation: ${t.designInfo.allocation || 'N/A'}, Masking: ${t.designInfo.maskingInfo?.masking || 'N/A'}, Study Purpose: ${t.designInfo.primaryPurpose || 'N/A'}`;
    }

    if (t.primaryOutcomes && t.primaryOutcomes.length > 0) {
      summary += `
Primary Outcome Measures Planned: ${t.primaryOutcomes.map(o => o.measure).join(' | ')}`;
    }

    if (t.seriousEvents && t.seriousEvents.length > 0) {
      const activeSerious = t.seriousEvents.slice(0, 5).map(e => `${e.term} (${e.numAffected} patients affected)`).join(', ');
      summary += `
Top Reported Serious Adverse Events (SAE): ${activeSerious}`;
    }

    if (t.resultsData?.outcomeMeasures && t.resultsData.outcomeMeasures.length > 0) {
      const outcomeSample = t.resultsData.outcomeMeasures
        .filter(m => m.type.toUpperCase() === 'PRIMARY')
        .slice(0, 3)
        .map(m => `${m.title} (${m.unitOfMeasure || 'N/A'}): ${m.classes?.map(c => c.title || '').join(', ')}`)
        .join(' | ');
      if (outcomeSample) {
        summary += `
Primary Outcome Actual Results Sample: ${outcomeSample}`;
      }
    }
    
    return summary;
  }).join('\n\n---\n\n');

  // Build biostatistical parameter text
  let statsContext = '';
  if (options) {
    statsContext = `
=============================================
ADVANCED META-ANALYSIS PARAMETERS & ESTIMATES:
- Endpoint Paradigm Classification: ${options.endpointType || 'N/A'}
- Statistical Effect Metric Utilized: ${options.effectMetric || 'N/A'}
- Analysis Integration Model: ${options.poolingModel || 'N/A'}

USER-SUPERVISED TRIAL DATA SUMMARY TABLE:
${options.customDataSummary || 'None provided'}

CALCULATED POOLED STATISTICAL OUTCOME ESTIMATES:
${options.pooledStats || 'None calculated'}
=============================================
`;
  }

  const prompt = isEn ? `
    You are an expert clinical biostatistician, epidemiologist, and meta-analysis scientist. 
    You have been provided with a cohort of clinical trials, along with an advanced statistical control panel configuration and pooled calculation outcomes.
    
    ${statsContext}
    
    Below is the clinical details of the trial cohort:
    ${trialsSummary}
    
    Your task:
    Perform a highly rigorous, structured Meta-Analysis and Synthesis report on this cohort, directly integrating the calculated study effect sizes, pooling models, and heterogeneity metrics (Cochran's Q, I-squared, p-value) displayed in the stats parameters above.
    Do not invent or change the calculated numbers. Critically evaluate what they reveal medically and scientifically.
    
    Structure your scientific analysis report under the following headings:
    1. **Executive Summary of the Integrated Cohort**: High-level overview of the cumulative trial cohort, demographic/disease overlaps, and clinical objectives.
    2. **Analysis Specifications, Methodology Quality & Outcome Indicator Inspection**: 
       - Discuss the chosen endpoint categorization (${options?.endpointType}), statistical effect metric (${options?.effectMetric}), and why the ${options?.poolingModel} model is appropriate (referencing the calculated I-squared heterogeneity percentage).
       - **Measurement Indicator Consistency Inspection**: Review and compare the specific "Selected Outcome Measure" of all chosen trials in the "USER-SUPERVISED TRIAL DATA SUMMARY TABLE" above. Explicitly analyze whether these measurement indicator items are consistent (e.g., similar endpoints, same time frames, or same assessment metrics). Highlight any potential mismatches or clinical discrepancies that could introduce bias, and discuss how any mismatches affect the validity or clinical interpretation of the pooled meta-analysis result.
    3. **Treatment Efficacy & Pooled Forest Plot Evaluation**:
       - Analyze study-specific estimates and contrast therapeutic strengths or comparator arm details.
       - Cite the pooled effect size, confidence interval, and p-value. Answer: Does the aggregate diamond cross the null line? Is the pooled therapy effect size clinically and statistically significant?
    4. **Safety, Adverse Events & Toxicity Risk Synthesis**: Synthesize severe adverse event signals and patient counts, identifying high-risk regimens.
    5. **Study Heterogeneity & Methodological Quality Bias Risk**: 
       - Evaluate Cochran's Q and I-squared statistic values to critique cohort consistency or dispersion.
       - Assess potential risk of bias based on study design details (masking vs open label, randomization allocations).
    6. **Clinical Recommendations & Future Trial Design Insights**: Strategic suggestions for practice guidelines or subsequent clinical trial planning.
    
    Format the response strictly with clean markdown. Keep the tone academic, authoritative, and biostatistically rigorous. All responses MUST be in English.
  ` : `
    你是一位資深的臨床研究生物統計學家、流行病學專家與統合分析（Meta-Analysis）頂尖科學家。
    請針對使用者所提供的臨床試驗與高階統計控制面板配置、使用者管理的明細數據以及系統進行的統合分析算體結果，撰寫一份高學術價值的統合分析綜整與偏誤評估報告。
    
    ${statsContext}
    
    以下為選取的臨床試驗學術詳情：
    ${trialsSummary}
    
    請依據上述提供的統計資料、試驗各組數據、異質性指標（如 Cochran's Q, I² 比例, 顯著性 p-value）以及合併效應量結果，撰寫一份專業嚴謹、結構精緻的統合分析科學報告。
    切勿捏造或隨意修改已算出的統計數字。請直接引用並進行深入的臨床、方法學與藥物動力學解讀。
    
    請遵循以下結構撰寫：
    1. **統合分析試驗群組概述 (Executive Cohort Overview)**：綜述這批試驗所涉疾病標的、介入分組特徵、目標受試者規模與臨床研究目標。
    2. **數據終點與統計合併模型方法學評量與指標檢視**：
       - 分析終點分類 (${options?.endpointType === 'binary' ? '二元終點' : '連續終點'}) 與效應指標 (${options?.effectMetric}) 的臨床測量維度。
       - 論述選擇使用「${options?.poolingModel === 'fixed' ? '固定效應模型 (Fixed Effects Model)' : '隨機效應模型 (Random Effects Model)'}」的科學依據（特別結合所計算出的 I-squared 異質性程度）。
       - **所選試驗量測指標一致性檢視**：必須仔細檢查與比對上方「USER-SUPERVISED TRIAL DATA SUMMARY TABLE」中各研究所選用的「量測指標 (Selected Outcome Measure)」。明確討論這些量測指標項目是否相符與一致（例如：是否存在不同的測量指標項目、不同的時間點或不同的定義）。如果發現任何量測指標項目不符或潛在不一致的問題，必須在報告中點出，並深入剖析這對統合分析合併結果（Pooled Results）的臨床解釋與異質性 (Heterogeneity) 的影響，以防範量測指標不符的問題。
    3. **療效綜整與森林圖 (Forest Plot) 效應量深度解讀**：
       - 逐一分析各試驗組與對照組的療效表現或劑量效益。
       - **著重引用**合併後的總體效應量估計值、95% 信賴區間（CI）與 Z 檢定顯著性 p-value。回答：合併後的信賴區間鑽石（Diamond）是否跨越無效線？該研究藥物/療法是否具有確切的臨床實質療效與統計顯著性？
    4. **安全性與嚴重不良反應 (SAE) 毒性 profile 評估**：綜合分析試驗中的嚴重不良反應（SAE）受影響人數與項目，對照不同藥物分組的安全性風險。
    5. **群組間異質性成因分析與方法學偏誤風險 (Heterogeneity & Methodological Bias Risk)**：
       - 利用計算出的 Cochran's Q 與 I-squared (%)，解讀研究間數據不一致的可能來源（臨床異質性、設計異質性）。
       - 評估各試驗設計（隨機分配、遮盲形式、開放標籤對照等）的潛在方法學偏誤風險。
    6. **臨床轉譯指引與未來試驗設計啟示 (Clinical Recommendations Page)**：為臨床醫療指引調整、醫病共享決策或未來進行類似臨床試驗的設計提供具體的建設性建議。
    
    請使用高雅流暢、極具學術公信力與專業深度的繁體中文醫療學術語氣撰寫，結構繁密、字句推敲、論證嚴格。使用 Markdown 格式呈現，避免空泛、套話式的描述。
  `;

  try {
    const response = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
    });
    return response.text || (isEn ? "No response generated." : "無法生成分析。");
  } catch (error) {
    console.warn('Error in analyzeCohort server: Error:', error);
    handleServerGeminiException(error);
    return isEn 
      ? "An error occurred while generating the meta-analysis synthesis." 
      : "在生成統合分析綜合報告時發生錯誤。";
  }
}

export interface SaeSearchResponse {
  matchedTerm: string;
  alignedTrialTerms: Record<string, string>;
  allMatchingTerms: string[];
  confidence: number;
}

export async function searchAdverseEvents(
  userInput: string,
  trials: Trial[],
  lang: 'zh' | 'en' = 'zh'
): Promise<SaeSearchResponse> {
  const trialEvents: { nctId: string; term: string; type: string }[] = [];
  
  if (trials && trials.length > 0) {
    trials.forEach(t => {
      const seen = new Set<string>();
      [...(t.seriousEvents || []), ...(t.otherEvents || [])].forEach(e => {
        if (!e || !e.term) return;
        const key = e.term.toLowerCase().trim();
        if (!seen.has(key)) {
          seen.add(key);
          trialEvents.push({ 
            nctId: t.nctId, 
            term: e.term, 
            type: t.seriousEvents?.some(se => se.term === e.term) ? 'serious' : 'other' 
          });
        }
      });
    });
  }

  if (trialEvents.length === 0) {
    return {
      matchedTerm: "",
      alignedTrialTerms: {},
      allMatchingTerms: [],
      confidence: 0
    };
  }

  const prompt = `
    You are an expert clinical trial semantic analyst.
    The user is searching for an adverse event / symptom inside our clinical trials meta-analysis database.
    User search query: "${userInput}"
    
    Here are all the adverse event terms currently recorded in our trials pool:
    ${JSON.stringify(trialEvents, null, 2)}
    
    Your task:
    1. Analyze the user query. Identify if any of the trial terms describe the same symptom or condition, considering spelling variations (e.g. diarrhea vs diarrhoea), translations (e.g. 腹瀉 vs diarrhea), synonyms, or closely related symptom clusters (e.g. "nausea" and "nausea/vomiting").
    2. If you find a match:
       - Set "matchedTerm" to the best representative actual term found in the trials (must be an exact term string from the listed items, case-sensitively matching).
       - In "alignedTrialTerms", map each matching trial's NCT ID to its EXACT spelled adverse event term from the trials list. If a trial doesn't have a matching term, do not include its NCT ID in this map.
       - In "allMatchingTerms", list all distinct terms across all trials that matched or were grouped under this symptom category.
       - Set "confidence" between 0.0 and 1.0.
    3. If no matching term is found at all, return empty values: matchedTerm as "", alignedTrialTerms as {}, allMatchingTerms as [], and confidence as 0.
    
    You must return a valid JSON response matching this schema:
    {
      "matchedTerm": "string (the unified/standard selected term from the list)",
      "alignedTrialTerms": {
        "NCT_ID": "exact trial-specific spelled term"
      },
      "allMatchingTerms": ["array of matched terms"],
      "confidence": number
    }
  `;

  try {
    const response = await generateContentWithFallback({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matchedTerm: { type: Type.STRING },
            alignedTrialTerms: {
              type: Type.OBJECT,
              description: "Mapping of NCT ID keys to their exact trial-specific spelled adverse event terms"
            },
            allMatchingTerms: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            confidence: { type: Type.NUMBER }
          },
          required: ["matchedTerm", "alignedTrialTerms", "allMatchingTerms", "confidence"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      return {
        matchedTerm: "",
        alignedTrialTerms: {},
        allMatchingTerms: [],
        confidence: 0
      };
    }

    return JSON.parse(text) as SaeSearchResponse;
  } catch (error) {
    console.error('Error searching adverse events with Gemini Server:', error);
    handleServerGeminiException(error);
    return {
      matchedTerm: "",
      alignedTrialTerms: {},
      allMatchingTerms: [],
      confidence: 0
    };
  }
}

