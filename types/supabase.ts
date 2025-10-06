export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ai_trends_roots: {
        Row: {
          id: string;
          label: string;
          keyword: string;
          locale: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          keyword: string;
          locale?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          label?: string;
          keyword?: string;
          locale?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_trends_keywords: {
        Row: {
          id: string;
          keyword: string;
          locale: string;
          timeframe: string;
          demand_category: string | null;
          is_brand: boolean;
          spike_score: number | null;
          priority: string | null;
          first_seen: string;
          last_seen: string;
          summary: string | null;
          news_refs: string[] | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          keyword: string;
          locale: string;
          timeframe: string;
          demand_category?: string | null;
          is_brand?: boolean;
          spike_score?: number | null;
          priority?: string | null;
          first_seen: string;
          last_seen: string;
          summary?: string | null;
          news_refs?: string[] | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          keyword?: string;
          locale?: string;
          timeframe?: string;
          demand_category?: string | null;
          is_brand?: boolean;
          spike_score?: number | null;
          priority?: string | null;
          first_seen?: string;
          last_seen?: string;
          summary?: string | null;
          news_refs?: string[] | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_trends_snapshots: {
        Row: {
          id: string;
          keyword_id: string;
          collected_at: string;
          trend_score: number | null;
          related_queries: Json | null;
          series: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          keyword_id: string;
          collected_at: string;
          trend_score?: number | null;
          related_queries?: Json | null;
          series?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          keyword_id?: string;
          collected_at?: string;
          trend_score?: number | null;
          related_queries?: Json | null;
          series?: Json | null;
          created_at?: string;
        };
      };
      ai_trends_news: {
        Row: {
          id: string;
          title: string;
          url: string;
          source: string | null;
          published_at: string | null;
          summary: string | null;
          keywords: string[] | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          url: string;
          source?: string | null;
          published_at?: string | null;
          summary?: string | null;
          keywords?: string[] | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          url?: string;
          source?: string | null;
          published_at?: string | null;
          summary?: string | null;
          keywords?: string[] | null;
          metadata?: Json;
          created_at?: string;
        };
      };
      ai_trends_candidate_roots: {
        Row: {
          id: string;
          term: string;
          term_normalized: string;
          source: string;
          status: string;
          raw_title: string | null;
          raw_summary: string | null;
          raw_tags: string[] | null;
          url: string | null;
          captured_at: string;
          expires_at: string;
          llm_label: string | null;
          llm_score: number | null;
          llm_reason: string | null;
          llm_attempts: number;
          llm_last_attempt: string | null;
          rejection_reason: string | null;
          queried_at: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          term: string;
          term_normalized: string;
          source: string;
          status?: string;
          raw_title?: string | null;
          raw_summary?: string | null;
          raw_tags?: string[] | null;
          url?: string | null;
          captured_at?: string;
          expires_at?: string;
          llm_label?: string | null;
          llm_score?: number | null;
          llm_reason?: string | null;
          llm_attempts?: number;
          llm_last_attempt?: string | null;
          rejection_reason?: string | null;
          queried_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          term?: string;
          term_normalized?: string;
          source?: string;
          status?: string;
          raw_title?: string | null;
          raw_summary?: string | null;
          raw_tags?: string[] | null;
          url?: string | null;
          captured_at?: string;
          expires_at?: string;
          llm_label?: string | null;
          llm_score?: number | null;
          llm_reason?: string | null;
          llm_attempts?: number;
          llm_last_attempt?: string | null;
          rejection_reason?: string | null;
          queried_at?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_trends_notifications: {
        Row: {
          id: string;
          rule_name: string;
          channel: string;
          config: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          rule_name: string;
          channel: string;
          config: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          rule_name?: string;
          channel?: string;
          config?: Json;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_trends_events: {
        Row: {
          id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
      };
      ai_trends_runs: {
        Row: {
          id: string;
          status: string;
          trigger_source: string | null;
          root_keywords: string[];
          metadata: Json;
          triggered_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          status?: string;
          trigger_source?: string | null;
          root_keywords?: string[];
          metadata?: Json;
          triggered_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          status?: string;
          trigger_source?: string | null;
          root_keywords?: string[];
          metadata?: Json;
          triggered_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      ai_trends_tasks: {
        Row: {
          id: string;
          run_id: string | null;
          task_id: string;
          keyword: string;
          locale: string;
          timeframe: string;
          location_name: string | null;
          location_code: number | null;
          language_name: string | null;
          status: string;
          payload: Json;
          error: Json | null;
          cost: number | null;
          posted_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          run_id?: string | null;
          task_id: string;
          keyword: string;
          locale: string;
          timeframe: string;
          location_name?: string | null;
          location_code?: number | null;
          language_name?: string | null;
          status?: string;
          payload?: Json;
          error?: Json | null;
          cost?: number | null;
          posted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string | null;
          task_id?: string;
          keyword?: string;
          locale?: string;
          timeframe?: string;
          location_name?: string | null;
          location_code?: number | null;
          language_name?: string | null;
          status?: string;
          payload?: Json;
          error?: Json | null;
          cost?: number | null;
          posted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};
