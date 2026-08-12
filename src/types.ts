
export interface Trial {
  nctId: string;
  briefTitle: string;
  officialTitle?: string;
  status: string;
  conditions: string[];
  interventions?: { type: string; name: string; description?: string }[];
  summary?: string;
  detailedDescription?: string;
  eligibilityCriteria?: string;
  locations?: { facility: string; city: string; state?: string; country: string }[];
  sponsor?: string;
  phase?: string[];
  hasResults?: boolean;
  lastUpdateSubmitDate?: string;
  primaryOutcomes?: { measure: string; description?: string; timeFrame?: string }[];
  secondaryOutcomes?: { measure: string; description?: string; timeFrame?: string }[];
  designInfo?: {
    studyType?: string;
    phases?: string[];
    allocation?: string;
    interventionModel?: string;
    primaryPurpose?: string;
    maskingInfo?: {
      masking?: string;
      whoMasked?: string[];
    };
  };
  detailedSummary?: string;
  resultsData?: {
    outcomeMeasures?: { 
      type: string; 
      title: string; 
      description?: string; 
      population?: string; 
      unitOfMeasure?: string;
      paramType?: string;
      dispersionType?: string;
      groups?: { id: string; title: string; description?: string }[];
      denoms?: { units: string; counts: { value: string; groupId: string }[] }[];
      classes?: {
        title?: string;
        denoms?: { units: string; counts: { value: string; groupId: string }[] }[];
        categories?: {
          title?: string;
          measurements?: { value: string; groupId: string; spread?: string }[];
        }[];
      }[];
      values?: any[]; 
    }[];
    participantFlow?: string;
    adverseEvents?: string;
  };
  seriousEvents?: { 
    term: string; 
    organSystem: string; 
    numEvents: number; 
    numAffected: number;
    stats?: { groupId: string; numEvents?: number; numAffected?: number; numAtRisk?: number }[];
  }[];
  otherEvents?: { 
    term: string; 
    organSystem: string; 
    numEvents: number; 
    numAffected: number;
    stats?: { groupId: string; numEvents?: number; numAffected?: number; numAtRisk?: number }[];
  }[];
  eventGroups?: {
    id: string;
    title: string;
    description?: string;
  }[];
  statusModule?: any;
  armsInterventionsModule?: any;
  eligibilityModule?: any;
  referencesModule?: any;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trials?: Trial[];
  relatedTrial?: Trial;
  isLoading?: boolean;
  apiUrl?: string;
  parsedQuery?: ApiQuery;
}

export interface ApiQuery {
  term?: string;
  cond?: string;
  locn?: string;
  intr?: string;
  outc?: string;
  phase?: string[];
  status?: string[];
  category?: 'study_design' | 'locations' | 'primary_outcomes' | 'secondary_outcomes' | 'serious_adverse' | 'other_adverse' | 'status_dates';
  sort?: string;
  designAllocation?: string[];
  interventionalAssignment?: string[];
  designMasking?: string[];
  whoMasked?: string[];
  observationalModel?: string[];
  primaryPurpose?: string[];
  studyType?: string[];
  armGroupType?: string[];
  interventionType?: string[];
  standardAge?: string[];
  aggFilters?: string;
  intent?: string;
  nctId?: string;
  nctIds?: string[];
  titles?: string;
  dateRange?: string;
}
