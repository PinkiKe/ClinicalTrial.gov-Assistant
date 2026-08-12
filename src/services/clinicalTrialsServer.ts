import { Trial, ApiQuery } from '../types';

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';

export async function searchTrials(query: ApiQuery, pageSize = 5, signal?: AbortSignal): Promise<{ trials: Trial[]; url: string }> {
  const params = new URLSearchParams();
  const additionalTerms: string[] = [];

  // 1. 處理由 LLM 提取出的日期區間語法
  if (query.dateRange) {
    additionalTerms.push(query.dateRange);
  }

  // 通用的 AREA 陣列處理函式：將同類別項目組合，若大於一筆則用 () 和 OR 包裝
  const processAreaField = (fieldValues: string[] | undefined) => {
    if (!fieldValues || fieldValues.length === 0) return;
    
    // 過濾掉可能的空字串
    const validValues = fieldValues.filter(val => val && val.trim() !== '');
    if (validValues.length === 0) return;

    if (validValues.length === 1) {
      additionalTerms.push(validValues[0]);
    } else {
      additionalTerms.push(`(${validValues.join(' OR ')})`);
    }
  };

  // 2. 依序處理所有來自 LLM 輸出的 AREA 格式陣列欄位
  processAreaField(query.phase);
  processAreaField(query.designAllocation);
  processAreaField(query.interventionalAssignment);
  processAreaField(query.designMasking);
  processAreaField(query.observationalModel);
  processAreaField(query.primaryPurpose);
  processAreaField(query.studyType);
  processAreaField(query.armGroupType);
  processAreaField(query.interventionType);
  processAreaField(query.standardAge);

  // 3. 處理結果篩選 (aggFilters) 判斷
  let hasResultsFilter: boolean | null = null;
  
  if (query.aggFilters) {
    const lowerAgg = query.aggFilters.toLowerCase();
    if (lowerAgg.includes('without')) {
      hasResultsFilter = false;
    } else if (lowerAgg.includes('with')) {
      hasResultsFilter = true;
    }
  }

  const resultsWithRegex = /(含結果|包含結果|有結果|有數據|有試驗數據|with\s+results|results\s*:?\s*with)/i;
  const resultsWithoutRegex = /(無結果|沒有結果|不含結果|不包含結果|without\s+results|results\s*:?\s*without)/i;

  const checkTextForResults = (text: string | undefined) => {
    if (!text) return;
    if (resultsWithoutRegex.test(text)) {
      hasResultsFilter = false;
    } else if (resultsWithRegex.test(text)) {
      hasResultsFilter = true;
    }
  };

  // 檢查所有可能包含文字的欄位是否有提到結果狀態
  checkTextForResults(query.term);
  checkTextForResults(query.cond);
  checkTextForResults(query.intr);
  checkTextForResults(query.outc);
  checkTextForResults(query.titles);

  const cleanText = (text: string | undefined): string => {
    if (!text) return '';
    return text
      .replace(/(含結果|包含結果|有結果|有數據|有試驗數據|無結果|沒有結果|不含結果|不包含結果|without\s+results|with\s+results|results\s*:?\s*with|results\s*:?\s*without)/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // 4. 組合 finalTerm：原有的 query.term 加上 additionalTerms (AREA參數與日期篩選)
  // 陣列之間與陣列內部皆使用 AND 拼接
  let finalTerm = cleanText(query.term);
  if (additionalTerms.length > 0) {
    const addStr = additionalTerms.join(' AND ');
    finalTerm = finalTerm ? `${finalTerm} AND ${addStr}` : addStr;
  }

  const cleanedCond = cleanText(query.cond);
  const cleanedIntr = cleanText(query.intr);
  const cleanedOutc = cleanText(query.outc);
  const cleanedTitles = cleanText(query.titles);

  // 5. 將所有清理與組合後的參數加入 URLSearchParams
  if (finalTerm) params.append('query.term', finalTerm);
  if (cleanedCond) params.append('query.cond', cleanedCond);
  if (query.locn) params.append('query.locn', query.locn);
  if (cleanedIntr) params.append('query.intr', cleanedIntr);
  if (cleanedOutc) params.append('query.outc', cleanedOutc);
  if (cleanedTitles) params.append('query.titles', cleanedTitles); // 新增對試驗標題的精準搜尋
  
  if (query.sort) params.append('sort', query.sort); // 新增排序功能

  if (query.nctIds && query.nctIds.length > 0) {
    params.append('filter.ids', query.nctIds.join('|'));
  } else if (query.nctId) {
    params.append('filter.ids', query.nctId);
  }

  if (hasResultsFilter !== null) {
    if (hasResultsFilter) {
      params.append('aggFilters', 'results:with');
    } else {
      params.append('aggFilters', 'results:without');
    }
  } else if (query.aggFilters) {
    try {
      const decodedAgg = decodeURIComponent(query.aggFilters);
      params.append('aggFilters', decodedAgg);
    } catch (e) {
      params.append('aggFilters', query.aggFilters);
    }
  }
  
  // 處理保留原樣的 status 欄位 (對應至 filter.overallStatus)
  if (query.status && query.status.length > 0) {
    const validStatus = query.status.filter(s => s && s.trim() !== '');
    if (validStatus.length > 0) {
      const formattedStatus = validStatus.map(s => s.toUpperCase().replace(/\s+/g, '_'));
      params.append('filter.overallStatus', formattedStatus.join(','));
    }
  }
  
  params.append('pageSize', pageSize.toString());
  params.append('format', 'json');

  try {
    const targetUrl = `${BASE_URL}?${params.toString()}`;
    const response = await fetch(targetUrl, { signal });
    if (!response.ok) throw new Error(`Failed to fetch trials: status ${response.status}`);
    
    const data = await response.json();
    
    // (下方資料映射維持與原始檔案一致，負責前端 UI 顯示轉換)
    const trials = (data.studies || []).map((study: any) => {
      const info = study.protocolSection;
      return {
        nctId: info.identificationModule.nctId,
        briefTitle: info.identificationModule.briefTitle,
        officialTitle: info.identificationModule.officialTitle,
        status: info.statusModule.overallStatus,
        statusModule: info.statusModule,
        armsInterventionsModule: info.armsInterventionsModule,
        eligibilityModule: info.eligibilityModule,
        referencesModule: info.referencesModule,
        conditions: info.conditionsModule?.conditions || [],
        interventions: info.armsInterventionsModule?.interventions?.map((i: any) => ({
          type: i.type,
          name: i.name,
          description: i.description
        })),
        summary: info.descriptionModule?.briefSummary,
        detailedDescription: info.descriptionModule?.detailedDescription,
        eligibilityCriteria: info.eligibilityModule?.eligibilityCriteria,
        locations: info.contactsLocationsModule?.locations?.map((l: any) => ({
          facility: l.facility,
          city: l.city,
          state: l.state,
          country: l.country
        })),
        sponsor: info.sponsorCollaboratorsModule?.leadSponsor?.name,
        phase: info.designModule?.phases,
        hasResults: !!(info.statusModule.hasResults || study.resultsSection || info.statusModule.resultsFirstPostDate || info.statusModule.resultsFirstPostDateStruct || info.statusModule.resultsFirstSubmitDate),
        lastUpdateSubmitDate: info.statusModule.lastUpdateSubmitDate,
        primaryOutcomes: info.outcomesModule?.primaryOutcomes?.map((o: any) => ({
          measure: o.measure,
          description: o.description,
          timeFrame: o.timeFrame
        })),
        secondaryOutcomes: info.outcomesModule?.secondaryOutcomes?.map((o: any) => ({
          measure: o.measure,
          description: o.description,
          timeFrame: o.timeFrame
        })),
        designInfo: info.designModule ? {
          studyType: info.designModule.studyType,
          phases: info.designModule.phases,
          allocation: info.designModule.designInfo?.allocation,
          interventionModel: info.designModule.designInfo?.interventionModel,
          primaryPurpose: info.designModule.designInfo?.primaryPurpose,
          maskingInfo: info.designModule.designInfo?.maskingInfo
        } : undefined,
        resultsData: study.resultsSection ? {
          outcomeMeasures: study.resultsSection.outcomeMeasuresModule?.outcomeMeasures?.map((m: any) => ({
            type: m.type,
            title: m.title,
            description: m.description,
            population: m.populationDescription,
            unitOfMeasure: m.unitOfMeasure,
            paramType: m.paramType,
            dispersionType: m.dispersionType,
            groups: m.groups?.map((g: any) => ({
              id: g.id,
              title: g.title,
              description: g.description
            })),
            denoms: m.denoms?.map((d: any) => ({
              units: d.units,
              counts: d.counts?.map((c: any) => ({
                value: c.value,
                groupId: c.groupId
              }))
            })),
            classes: m.classes?.map((c: any) => ({
              title: c.title,
              denoms: c.denoms?.map((d: any) => ({
                units: d.units,
                counts: d.counts?.map((co: any) => ({
                  value: co.value,
                  groupId: co.groupId
                }))
              })),
              categories: c.categories?.map((cat: any) => ({
                title: cat.title,
                measurements: cat.measurements?.map((v: any) => ({
                  value: v.value,
                  groupId: v.groupId,
                  spread: v.spread
                }))
              }))
            }))
          })),
          participantFlow: study.resultsSection.participantFlowModule?.preAssignmentDetails,
          adverseEvents: study.resultsSection.adverseEventsModule?.description
        } : undefined,
        eventGroups: study.resultsSection?.adverseEventsModule?.eventGroups?.map((g: any) => ({
          id: g.id,
          title: g.title,
          description: g.description
        })),
        seriousEvents: study.resultsSection?.adverseEventsModule?.seriousEvents
          ?.map((e: any) => ({
            term: e.term,
            organSystem: e.organSystem,
            numEvents: e.stats?.reduce((sum: number, s: any) => sum + (s.numEvents || 0), 0) || 0,
            numAffected: e.stats?.reduce((sum: number, s: any) => sum + (s.numAffected || 0), 0) || 0,
            stats: e.stats?.map((s: any) => ({
              groupId: s.groupId,
              numEvents: s.numEvents,
              numAffected: s.numAffected,
              numAtRisk: s.numAtRisk
            }))
          }))
          .sort((a: any, b: any) => b.numEvents - a.numEvents),
        otherEvents: study.resultsSection?.adverseEventsModule?.otherEvents
          ?.map((e: any) => ({
            term: e.term,
            organSystem: e.organSystem,
            numEvents: e.stats?.reduce((sum: number, s: any) => sum + (s.numEvents || 0), 0) || 0,
            numAffected: e.stats?.reduce((sum: number, s: any) => sum + (s.numAffected || 0), 0) || 0,
            stats: e.stats?.map((s: any) => ({
              groupId: s.groupId,
              numEvents: s.numEvents,
              numAffected: s.numAffected,
              numAtRisk: s.numAtRisk
            }))
          }))
          .sort((a: any, b: any) => b.numEvents - a.numEvents)
      };
    });
    return { trials, url: targetUrl };
  } catch (error) {
    console.error('Error searching trials backend:', error);
    throw error;
  }
}

export async function getTrialDetails(nctId: string, signal?: AbortSignal): Promise<Trial | null> {
  try {
    const response = await fetch(`${BASE_URL}/${nctId}`, { signal });
    if (!response.ok) throw new Error(`Failed to fetch trial details: status ${response.status}`);
    
    const study = await response.json();
    const info = study.protocolSection;
    return {
      nctId: info.identificationModule.nctId,
      briefTitle: info.identificationModule.briefTitle,
      officialTitle: info.identificationModule.officialTitle,
      status: info.statusModule.overallStatus,
      statusModule: info.statusModule,
      armsInterventionsModule: info.armsInterventionsModule,
      eligibilityModule: info.eligibilityModule,
      referencesModule: info.referencesModule,
      conditions: info.conditionsModule?.conditions || [],
      interventions: info.armsInterventionsModule?.interventions?.map((i: any) => ({
        type: i.type,
        name: i.name,
        description: i.description
      })),
      summary: info.descriptionModule?.briefSummary,
      detailedDescription: info.descriptionModule?.detailedDescription,
      eligibilityCriteria: info.eligibilityModule?.eligibilityCriteria,
      locations: info.contactsLocationsModule?.locations?.map((l: any) => ({
        facility: l.facility,
        city: l.city,
        state: l.state,
        country: l.country
      })),
      sponsor: info.sponsorCollaboratorsModule?.leadSponsor?.name,
      phase: info.designModule?.phases,
      hasResults: !!(info.statusModule.hasResults || study.resultsSection || info.statusModule.resultsFirstPostDate || info.statusModule.resultsFirstPostDateStruct || info.statusModule.resultsFirstSubmitDate),
      lastUpdateSubmitDate: info.statusModule.lastUpdateSubmitDate,
      primaryOutcomes: info.outcomesModule?.primaryOutcomes?.map((o: any) => ({
        measure: o.measure,
        description: o.description,
        timeFrame: o.timeFrame
      })),
      secondaryOutcomes: info.outcomesModule?.secondaryOutcomes?.map((o: any) => ({
        measure: o.measure,
        description: o.description,
        timeFrame: o.timeFrame
      })),
      designInfo: info.designModule ? {
        studyType: info.designModule.studyType,
        phases: info.designModule.phases,
        allocation: info.designModule.designInfo?.allocation,
        interventionModel: info.designModule.designInfo?.interventionModel,
        primaryPurpose: info.designModule.designInfo?.primaryPurpose,
        maskingInfo: info.designModule.designInfo?.maskingInfo
      } : undefined,
      resultsData: study.resultsSection ? {
        outcomeMeasures: study.resultsSection.outcomeMeasuresModule?.outcomeMeasures?.map((m: any) => ({
          type: m.type,
          title: m.title,
          description: m.description,
          population: m.populationDescription,
          unitOfMeasure: m.unitOfMeasure,
          paramType: m.paramType,
          dispersionType: m.dispersionType,
          groups: m.groups?.map((g: any) => ({
            id: g.id,
            title: g.title,
            description: g.description
          })),
          denoms: m.denoms?.map((d: any) => ({
            units: d.units,
            counts: d.counts?.map((c: any) => ({
              value: c.value,
              groupId: c.groupId
            }))
          })),
          classes: m.classes?.map((c: any) => ({
            title: c.title,
            denoms: c.denoms?.map((d: any) => ({
              units: d.units,
              counts: d.counts?.map((co: any) => ({
                value: co.value,
                groupId: co.groupId
              }))
            })),
            categories: c.categories?.map((cat: any) => ({
              title: cat.title,
              measurements: cat.measurements?.map((v: any) => ({
                value: v.value,
                groupId: v.groupId,
                spread: v.spread
              }))
            }))
          }))
        })),
        participantFlow: study.resultsSection.participantFlowModule?.preAssignmentDetails,
        adverseEvents: study.resultsSection.adverseEventsModule?.description
      } : undefined,
      eventGroups: study.resultsSection?.adverseEventsModule?.eventGroups?.map((g: any) => ({
        id: g.id,
        title: g.title,
        description: g.description
      })),
      seriousEvents: study.resultsSection?.adverseEventsModule?.seriousEvents
        ?.map((e: any) => ({
          term: e.term,
          organSystem: e.organSystem,
          numEvents: e.stats?.reduce((sum: number, s: any) => sum + (s.numEvents || 0), 0) || 0,
          numAffected: e.stats?.reduce((sum: number, s: any) => sum + (s.numAffected || 0), 0) || 0,
          stats: e.stats?.map((s: any) => ({
            groupId: s.groupId,
            numEvents: s.numEvents,
            numAffected: s.numAffected,
            numAtRisk: s.numAtRisk
          }))
        }))
        .sort((a: any, b: any) => b.numEvents - a.numEvents),
      otherEvents: study.resultsSection?.adverseEventsModule?.otherEvents
        ?.map((e: any) => ({
          term: e.term,
          organSystem: e.organSystem,
          numEvents: e.stats?.reduce((sum: number, s: any) => sum + (s.numEvents || 0), 0) || 0,
          numAffected: e.stats?.reduce((sum: number, s: any) => sum + (s.numAffected || 0), 0) || 0,
          stats: e.stats?.map((s: any) => ({
            groupId: s.groupId,
            numEvents: s.numEvents,
            numAffected: s.numAffected,
            numAtRisk: s.numAtRisk
          }))
        }))
        .sort((a: any, b: any) => b.numEvents - a.numEvents)
    };
  } catch (error) {
    console.error('Error fetching trial details backend:', error);
    throw error;
  }
}
