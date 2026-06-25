export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      canonical_shift_sources: {
        Row: {
          attached_at: string
          batch_id: string
          detached_at: string | null
          id: string
          is_active: boolean
          match_confidence: number | null
          shift_id: string
          source_kind: string
          staging_row_id: string
          venue_id: string
        }
        Insert: {
          attached_at?: string
          batch_id: string
          detached_at?: string | null
          id?: string
          is_active?: boolean
          match_confidence?: number | null
          shift_id: string
          source_kind: string
          staging_row_id: string
          venue_id: string
        }
        Update: {
          attached_at?: string
          batch_id?: string
          detached_at?: string | null
          id?: string
          is_active?: boolean
          match_confidence?: number | null
          shift_id?: string
          source_kind?: string
          staging_row_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_shift_sources_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_shift_sources_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_shift_sources_staging_row_id_fkey"
            columns: ["staging_row_id"]
            isOneToOne: false
            referencedRelation: "shift_staging_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_shift_sources_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          audit_goal: string | null
          created_at: string
          current_pos: string | null
          email: string
          id: string
          message: string
          monthly_revenue_band: string | null
          name: string
          phone: string | null
          restaurant: string | null
          role: string | null
          source: string | null
          venue_count: string | null
        }
        Insert: {
          audit_goal?: string | null
          created_at?: string
          current_pos?: string | null
          email: string
          id?: string
          message: string
          monthly_revenue_band?: string | null
          name: string
          phone?: string | null
          restaurant?: string | null
          role?: string | null
          source?: string | null
          venue_count?: string | null
        }
        Update: {
          audit_goal?: string | null
          created_at?: string
          current_pos?: string | null
          email?: string
          id?: string
          message?: string
          monthly_revenue_band?: string | null
          name?: string
          phone?: string | null
          restaurant?: string | null
          role?: string | null
          source?: string | null
          venue_count?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_master: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          labour_employee_id: string | null
          manager_confirmed: boolean
          normalised_name: string
          outlet_id: string | null
          pos_employee_id: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          labour_employee_id?: string | null
          manager_confirmed?: boolean
          normalised_name: string
          outlet_id?: string | null
          pos_employee_id?: string | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          labour_employee_id?: string | null
          manager_confirmed?: boolean
          normalised_name?: string
          outlet_id?: string | null
          pos_employee_id?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_master_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      lls_v2_audit_events: {
        Row: {
          actor: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json
          venue_id: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          venue_id: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lls_v2_audit_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      lls_v2_calculation_results: {
        Row: {
          adjusted_labor_cost: number | null
          adjusted_lls: number | null
          base_lls: number | null
          baseline_end: string | null
          baseline_start: string | null
          baseline_weeks: number
          benchmark_confidence: string | null
          comparable_adjusted_lls: number | null
          comparable_base_lls: number | null
          comparable_count: number | null
          computed_at: string
          configuration_hash: string
          configuration_snapshot: Json
          effective_of: number | null
          expected_sales: number | null
          final_confidence: string | null
          id: string
          identity_id: string | null
          inputs_snapshot: Json
          model_version: string
          modelled_revenue_opportunity: number | null
          of_components: Json | null
          of_version: string
          override_of: number | null
          performance_gap: number | null
          rag_status: string | null
          result_confidence: string | null
          result_scope: string
          revenue_gap: number | null
          rpc: number | null
          rph: number | null
          shift_id: string | null
          system_of: number | null
          venue_id: string
          week_start: string | null
        }
        Insert: {
          adjusted_labor_cost?: number | null
          adjusted_lls?: number | null
          base_lls?: number | null
          baseline_end?: string | null
          baseline_start?: string | null
          baseline_weeks: number
          benchmark_confidence?: string | null
          comparable_adjusted_lls?: number | null
          comparable_base_lls?: number | null
          comparable_count?: number | null
          computed_at?: string
          configuration_hash: string
          configuration_snapshot?: Json
          effective_of?: number | null
          expected_sales?: number | null
          final_confidence?: string | null
          id?: string
          identity_id?: string | null
          inputs_snapshot?: Json
          model_version: string
          modelled_revenue_opportunity?: number | null
          of_components?: Json | null
          of_version: string
          override_of?: number | null
          performance_gap?: number | null
          rag_status?: string | null
          result_confidence?: string | null
          result_scope: string
          revenue_gap?: number | null
          rpc?: number | null
          rph?: number | null
          shift_id?: string | null
          system_of?: number | null
          venue_id: string
          week_start?: string | null
        }
        Update: {
          adjusted_labor_cost?: number | null
          adjusted_lls?: number | null
          base_lls?: number | null
          baseline_end?: string | null
          baseline_start?: string | null
          baseline_weeks?: number
          benchmark_confidence?: string | null
          comparable_adjusted_lls?: number | null
          comparable_base_lls?: number | null
          comparable_count?: number | null
          computed_at?: string
          configuration_hash?: string
          configuration_snapshot?: Json
          effective_of?: number | null
          expected_sales?: number | null
          final_confidence?: string | null
          id?: string
          identity_id?: string | null
          inputs_snapshot?: Json
          model_version?: string
          modelled_revenue_opportunity?: number | null
          of_components?: Json | null
          of_version?: string
          override_of?: number | null
          performance_gap?: number | null
          rag_status?: string | null
          result_confidence?: string | null
          result_scope?: string
          revenue_gap?: number | null
          rpc?: number | null
          rph?: number | null
          shift_id?: string | null
          system_of?: number | null
          venue_id?: string
          week_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lls_v2_calculation_results_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lls_v2_calculation_results_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      lls_v2_of_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number
          daypart: string
          duration_tier: string
          effective_from: string
          effective_to: string | null
          id: string
          override_of: number
          reason: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: number
          daypart: string
          duration_tier: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          override_of: number
          reason?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          daypart?: string
          duration_tier?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          override_of?: number
          reason?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lls_v2_of_overrides_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_intelligence_audit_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
          venue_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
          venue_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_intelligence_audit_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_suggestions: {
        Row: {
          ai_reason: string | null
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          category: string | null
          created_at: string
          created_by: string | null
          evidence: Json
          id: string
          item_name: string
          item_pos_id: string | null
          margin: number | null
          menu_period: string | null
          price: number | null
          recommendation_confidence: string | null
          rejected_at: string | null
          rejected_reason: string | null
          sent_to_servers_at: string | null
          source_file: string | null
          source_menu_id: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          ai_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          id?: string
          item_name: string
          item_pos_id?: string | null
          margin?: number | null
          menu_period?: string | null
          price?: number | null
          recommendation_confidence?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          sent_to_servers_at?: string | null
          source_file?: string | null
          source_menu_id?: string | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          ai_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          evidence?: Json
          id?: string
          item_name?: string
          item_pos_id?: string | null
          margin?: number | null
          menu_period?: string | null
          price?: number | null
          recommendation_confidence?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          sent_to_servers_at?: string | null
          source_file?: string | null
          source_menu_id?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_suggestions_source_menu_id_fkey"
            columns: ["source_menu_id"]
            isOneToOne: false
            referencedRelation: "venue_menu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_suggestions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      organisation_memberships: {
        Row: {
          created_at: string
          id: string
          organisation_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organisation_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organisation_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organisation_memberships_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          created_at: string
          environment: string
          error: string | null
          event_id: string
          event_type: string
          id: string
          processed_at: string | null
          provider: string
          raw_payload: Json
          retry_count: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          environment: string
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          processed_at?: string | null
          provider?: string
          raw_payload: Json
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          environment?: string
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          processed_at?: string | null
          provider?: string
          raw_payload?: Json
          retry_count?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      server_category_stats: {
        Row: {
          category_key: string
          conversion: number | null
          created_at: string
          id: string
          metric_type: string
          net_sales: number
          opportunity_count: number | null
          quantity: number
          sales: number
          user_id: string
          venue_id: string
          week_start: string
        }
        Insert: {
          category_key: string
          conversion?: number | null
          created_at?: string
          id?: string
          metric_type?: string
          net_sales?: number
          opportunity_count?: number | null
          quantity?: number
          sales?: number
          user_id: string
          venue_id: string
          week_start: string
        }
        Update: {
          category_key?: string
          conversion?: number | null
          created_at?: string
          id?: string
          metric_type?: string
          net_sales?: number
          opportunity_count?: number | null
          quantity?: number
          sales?: number
          user_id?: string
          venue_id?: string
          week_start?: string
        }
        Relationships: []
      }
      server_category_targets: {
        Row: {
          category_key: string
          created_at: string
          id: string
          metric_type: string
          target: number
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          category_key: string
          created_at?: string
          id?: string
          metric_type?: string
          target?: number
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          category_key?: string
          created_at?: string
          id?: string
          metric_type?: string
          target?: number
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      server_coaching: {
        Row: {
          evidence: Json
          generated_at: string
          id: string
          suggestions: Json
          user_id: string
          venue_id: string
          week_start: string
        }
        Insert: {
          evidence?: Json
          generated_at?: string
          id?: string
          suggestions?: Json
          user_id: string
          venue_id: string
          week_start: string
        }
        Update: {
          evidence?: Json
          generated_at?: string
          id?: string
          suggestions?: Json
          user_id?: string
          venue_id?: string
          week_start?: string
        }
        Relationships: []
      }
      server_focus_acks: {
        Row: {
          acknowledged_at: string
          id: string
          user_id: string
          venue_id: string
          week_start: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          user_id: string
          venue_id: string
          week_start: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          user_id?: string
          venue_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_focus_acks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      server_logins: {
        Row: {
          id: string
          logged_in_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          id?: string
          logged_in_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          id?: string
          logged_in_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      server_milestones: {
        Row: {
          id: string
          milestone_type: string
          unlocked_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          id?: string
          milestone_type: string
          unlocked_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          id?: string
          milestone_type?: string
          unlocked_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_milestones_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      server_stat_views: {
        Row: {
          id: string
          user_id: string
          venue_id: string
          viewed_at: string
          week_start: string
        }
        Insert: {
          id?: string
          user_id: string
          venue_id: string
          viewed_at?: string
          week_start: string
        }
        Update: {
          id?: string
          user_id?: string
          venue_id?: string
          viewed_at?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_stat_views_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      server_stats: {
        Row: {
          cocktail_conversion: number | null
          cocktail_sales: number
          context: Json | null
          created_at: string
          dessert_conversion: number | null
          dessert_sales: number
          id: string
          sides_conversion: number | null
          sides_sales: number
          sparkling_conversion: number | null
          sparkling_sales: number
          spend_per_cover: number | null
          spirits_conversion: number | null
          spirits_sales: number
          total_covers: number
          total_sales: number
          user_id: string
          venue_id: string
          week_start: string
          wine_conversion: number | null
          wine_sales: number
        }
        Insert: {
          cocktail_conversion?: number | null
          cocktail_sales?: number
          context?: Json | null
          created_at?: string
          dessert_conversion?: number | null
          dessert_sales?: number
          id?: string
          sides_conversion?: number | null
          sides_sales?: number
          sparkling_conversion?: number | null
          sparkling_sales?: number
          spend_per_cover?: number | null
          spirits_conversion?: number | null
          spirits_sales?: number
          total_covers?: number
          total_sales?: number
          user_id: string
          venue_id: string
          week_start: string
          wine_conversion?: number | null
          wine_sales?: number
        }
        Update: {
          cocktail_conversion?: number | null
          cocktail_sales?: number
          context?: Json | null
          created_at?: string
          dessert_conversion?: number | null
          dessert_sales?: number
          id?: string
          sides_conversion?: number | null
          sides_sales?: number
          sparkling_conversion?: number | null
          sparkling_sales?: number
          spend_per_cover?: number | null
          spirits_conversion?: number | null
          spirits_sales?: number
          total_covers?: number
          total_sales?: number
          user_id?: string
          venue_id?: string
          week_start?: string
          wine_conversion?: number | null
          wine_sales?: number
        }
        Relationships: [
          {
            foreignKeyName: "server_stats_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      server_streaks: {
        Row: {
          current_streak: number
          id: string
          last_hit_week: string | null
          longest_streak: number
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          current_streak?: number
          id?: string
          last_hit_week?: string | null
          longest_streak?: number
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          current_streak?: number
          id?: string
          last_hit_week?: string | null
          longest_streak?: number
          updated_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_streaks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      server_targets: {
        Row: {
          cocktail_target: number
          created_at: string
          daily_sales_target: number
          dessert_target: number
          id: string
          sides_target: number
          sparkling_target: number
          spend_per_cover_target: number
          spirits_target: number
          updated_at: string
          user_id: string
          venue_id: string
          wine_target: number
        }
        Insert: {
          cocktail_target?: number
          created_at?: string
          daily_sales_target?: number
          dessert_target?: number
          id?: string
          sides_target?: number
          sparkling_target?: number
          spend_per_cover_target?: number
          spirits_target?: number
          updated_at?: string
          user_id: string
          venue_id: string
          wine_target?: number
        }
        Update: {
          cocktail_target?: number
          created_at?: string
          daily_sales_target?: number
          dessert_target?: number
          id?: string
          sides_target?: number
          sparkling_target?: number
          spend_per_cover_target?: number
          spirits_target?: number
          updated_at?: string
          user_id?: string
          venue_id?: string
          wine_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "server_targets_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_import_batches: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          filename: string | null
          id: string
          row_count: number
          source_type: string
          status: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          filename?: string | null
          id?: string
          row_count?: number
          source_type: string
          status?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          filename?: string | null
          id?: string
          row_count?: number
          source_type?: string
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_import_batches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_import_batches_v2: {
        Row: {
          accepted_count: number
          approved_at: string | null
          approved_by: string | null
          committed_at: string | null
          committed_shift_ids: string[]
          covers_total: number | null
          created_at: string
          error_message: string | null
          file_hash: string | null
          gross_total: number | null
          id: string
          import_type: string | null
          is_active: boolean
          labour_basis_summary: Json
          labour_total: number | null
          net_total: number | null
          notes: string | null
          rejected_count: number
          rolled_back_at: string | null
          rolled_back_by: string | null
          row_count: number
          sales_basis_summary: Json
          source_filename: string | null
          source_kind: string
          source_system: string | null
          status: string
          superseded_at: string | null
          superseded_by_batch_id: string | null
          updated_at: string
          uploaded_by: string | null
          validation_summary: Json
          venue_id: string
          warning_count: number
        }
        Insert: {
          accepted_count?: number
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          committed_shift_ids?: string[]
          covers_total?: number | null
          created_at?: string
          error_message?: string | null
          file_hash?: string | null
          gross_total?: number | null
          id?: string
          import_type?: string | null
          is_active?: boolean
          labour_basis_summary?: Json
          labour_total?: number | null
          net_total?: number | null
          notes?: string | null
          rejected_count?: number
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          row_count?: number
          sales_basis_summary?: Json
          source_filename?: string | null
          source_kind: string
          source_system?: string | null
          status?: string
          superseded_at?: string | null
          superseded_by_batch_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validation_summary?: Json
          venue_id: string
          warning_count?: number
        }
        Update: {
          accepted_count?: number
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          committed_shift_ids?: string[]
          covers_total?: number | null
          created_at?: string
          error_message?: string | null
          file_hash?: string | null
          gross_total?: number | null
          id?: string
          import_type?: string | null
          is_active?: boolean
          labour_basis_summary?: Json
          labour_total?: number | null
          net_total?: number | null
          notes?: string | null
          rejected_count?: number
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          row_count?: number
          sales_basis_summary?: Json
          source_filename?: string | null
          source_kind?: string
          source_system?: string | null
          status?: string
          superseded_at?: string | null
          superseded_by_batch_id?: string | null
          updated_at?: string
          uploaded_by?: string | null
          validation_summary?: Json
          venue_id?: string
          warning_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "shift_import_batches_v2_superseded_by_batch_id_fkey"
            columns: ["superseded_by_batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_import_batches_v2_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_labor_staging: {
        Row: {
          batch_id: string
          created_at: string
          derived_labor_span_end: string | null
          derived_labor_span_start: string | null
          job_role: string | null
          labor_clock_in: string | null
          labor_clock_out: string | null
          labor_cost: number | null
          labor_hours_reported: number | null
          labor_scheduled_end: string | null
          labor_scheduled_start: string | null
          staging_row_id: string
          venue_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          derived_labor_span_end?: string | null
          derived_labor_span_start?: string | null
          job_role?: string | null
          labor_clock_in?: string | null
          labor_clock_out?: string | null
          labor_cost?: number | null
          labor_hours_reported?: number | null
          labor_scheduled_end?: string | null
          labor_scheduled_start?: string | null
          staging_row_id: string
          venue_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          derived_labor_span_end?: string | null
          derived_labor_span_start?: string | null
          job_role?: string | null
          labor_clock_in?: string | null
          labor_clock_out?: string | null
          labor_cost?: number | null
          labor_hours_reported?: number | null
          labor_scheduled_end?: string | null
          labor_scheduled_start?: string | null
          staging_row_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_labor_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_labor_staging_staging_row_id_fkey"
            columns: ["staging_row_id"]
            isOneToOne: true
            referencedRelation: "shift_staging_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_labor_staging_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_sales_staging: {
        Row: {
          batch_id: string
          covers: number | null
          created_at: string
          gross_sales: number | null
          net_sales: number | null
          sales_check_close_time: string | null
          sales_check_open_time: string | null
          sales_employee_shift_end: string | null
          sales_employee_shift_start: string | null
          sales_first_txn_time: string | null
          sales_last_txn_time: string | null
          sales_report_period_end: string | null
          sales_report_period_start: string | null
          staging_row_id: string
          venue_id: string
        }
        Insert: {
          batch_id: string
          covers?: number | null
          created_at?: string
          gross_sales?: number | null
          net_sales?: number | null
          sales_check_close_time?: string | null
          sales_check_open_time?: string | null
          sales_employee_shift_end?: string | null
          sales_employee_shift_start?: string | null
          sales_first_txn_time?: string | null
          sales_last_txn_time?: string | null
          sales_report_period_end?: string | null
          sales_report_period_start?: string | null
          staging_row_id: string
          venue_id: string
        }
        Update: {
          batch_id?: string
          covers?: number | null
          created_at?: string
          gross_sales?: number | null
          net_sales?: number | null
          sales_check_close_time?: string | null
          sales_check_open_time?: string | null
          sales_employee_shift_end?: string | null
          sales_employee_shift_start?: string | null
          sales_first_txn_time?: string | null
          sales_last_txn_time?: string | null
          sales_report_period_end?: string | null
          sales_report_period_start?: string | null
          staging_row_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_sales_staging_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_sales_staging_staging_row_id_fkey"
            columns: ["staging_row_id"]
            isOneToOne: true
            referencedRelation: "shift_staging_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_sales_staging_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_staging_rows: {
        Row: {
          batch_id: string
          created_at: string
          duplicate_of_row_id: string | null
          duplicate_status: string
          excluded_from_canonical: boolean
          id: string
          identity_candidates: Json
          identity_confidence: number | null
          identity_match_method: string | null
          identity_status: string
          last_reconciled_at: string | null
          manager_confirmed_match: boolean
          manual_review_required: boolean
          raw_row: Json
          raw_row_hash: string
          reconciliation_status: string
          reported_identity_id: string | null
          reported_identity_name: string | null
          reported_outlet: string | null
          resolved_identity_id: string | null
          service_date: string | null
          source_kind: string
          source_row_index: number | null
          status_evidence: Json
          status_reason: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          duplicate_of_row_id?: string | null
          duplicate_status?: string
          excluded_from_canonical?: boolean
          id?: string
          identity_candidates?: Json
          identity_confidence?: number | null
          identity_match_method?: string | null
          identity_status?: string
          last_reconciled_at?: string | null
          manager_confirmed_match?: boolean
          manual_review_required?: boolean
          raw_row: Json
          raw_row_hash: string
          reconciliation_status?: string
          reported_identity_id?: string | null
          reported_identity_name?: string | null
          reported_outlet?: string | null
          resolved_identity_id?: string | null
          service_date?: string | null
          source_kind: string
          source_row_index?: number | null
          status_evidence?: Json
          status_reason?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          duplicate_of_row_id?: string | null
          duplicate_status?: string
          excluded_from_canonical?: boolean
          id?: string
          identity_candidates?: Json
          identity_confidence?: number | null
          identity_match_method?: string | null
          identity_status?: string
          last_reconciled_at?: string | null
          manager_confirmed_match?: boolean
          manual_review_required?: boolean
          raw_row?: Json
          raw_row_hash?: string
          reconciliation_status?: string
          reported_identity_id?: string | null
          reported_identity_name?: string | null
          reported_outlet?: string | null
          resolved_identity_id?: string | null
          service_date?: string | null
          source_kind?: string
          source_row_index?: number | null
          status_evidence?: Json
          status_reason?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_staging_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_staging_rows_duplicate_of_row_id_fkey"
            columns: ["duplicate_of_row_id"]
            isOneToOne: false
            referencedRelation: "shift_staging_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_staging_rows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          base_lls: number | null
          covers_served: number | null
          created_at: string
          day_of_week: number
          daypart: string
          final_lls: number | null
          gross_sales: number | null
          identity_match_confidence: number | null
          identity_match_method: string | null
          import_batch_v2_id: string | null
          imported_at: string | null
          labor_basis: string | null
          labor_batch_id: string | null
          labor_cost: number | null
          opportunity_factor: number | null
          provenance: Json
          reliability_class: string | null
          rpc: number | null
          sales_basis: string | null
          sales_batch_id: string | null
          server_id: string
          server_name: string | null
          shift_date: string
          shift_end_time: string | null
          shift_id: string
          shift_start_time: string | null
          source_row_hash: string | null
          source_system: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          base_lls?: number | null
          covers_served?: number | null
          created_at?: string
          day_of_week: number
          daypart: string
          final_lls?: number | null
          gross_sales?: number | null
          identity_match_confidence?: number | null
          identity_match_method?: string | null
          import_batch_v2_id?: string | null
          imported_at?: string | null
          labor_basis?: string | null
          labor_batch_id?: string | null
          labor_cost?: number | null
          opportunity_factor?: number | null
          provenance?: Json
          reliability_class?: string | null
          rpc?: number | null
          sales_basis?: string | null
          sales_batch_id?: string | null
          server_id: string
          server_name?: string | null
          shift_date: string
          shift_end_time?: string | null
          shift_id?: string
          shift_start_time?: string | null
          source_row_hash?: string | null
          source_system?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          base_lls?: number | null
          covers_served?: number | null
          created_at?: string
          day_of_week?: number
          daypart?: string
          final_lls?: number | null
          gross_sales?: number | null
          identity_match_confidence?: number | null
          identity_match_method?: string | null
          import_batch_v2_id?: string | null
          imported_at?: string | null
          labor_basis?: string | null
          labor_batch_id?: string | null
          labor_cost?: number | null
          opportunity_factor?: number | null
          provenance?: Json
          reliability_class?: string | null
          rpc?: number | null
          sales_basis?: string | null
          sales_batch_id?: string | null
          server_id?: string
          server_name?: string | null
          shift_date?: string
          shift_end_time?: string | null
          shift_id?: string
          shift_start_time?: string | null
          source_row_hash?: string | null
          source_system?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_import_batch_v2_id_fkey"
            columns: ["import_batch_v2_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_labor_batch_id_fkey"
            columns: ["labor_batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_sales_batch_id_fkey"
            columns: ["sales_batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts_v2: {
        Row: {
          active_batch_id: string | null
          canonical_identity_id: string
          clock_in: string | null
          clock_out: string | null
          confidence_breakdown: Json
          covers: number | null
          created_at: string
          cross_daypart: boolean
          daypart_distribution: Json
          dominant_daypart: string | null
          gross_sales: number | null
          id: string
          imported_at: string | null
          is_active: boolean
          is_single_sided: boolean
          labor_basis: string | null
          labor_cost: number | null
          labor_span_hours: number | null
          match_method: string | null
          needs_review: boolean
          net_sales: number | null
          provenance: Json
          reliability_class: string | null
          sales_basis: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          service_date: string
          service_duration_hours: number | null
          service_duration_source: string | null
          service_duration_tier: string | null
          single_sided_authorised_by: string | null
          single_sided_justification: string | null
          source_system: string | null
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          active_batch_id?: string | null
          canonical_identity_id: string
          clock_in?: string | null
          clock_out?: string | null
          confidence_breakdown?: Json
          covers?: number | null
          created_at?: string
          cross_daypart?: boolean
          daypart_distribution?: Json
          dominant_daypart?: string | null
          gross_sales?: number | null
          id?: string
          imported_at?: string | null
          is_active?: boolean
          is_single_sided?: boolean
          labor_basis?: string | null
          labor_cost?: number | null
          labor_span_hours?: number | null
          match_method?: string | null
          needs_review?: boolean
          net_sales?: number | null
          provenance?: Json
          reliability_class?: string | null
          sales_basis?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_date: string
          service_duration_hours?: number | null
          service_duration_source?: string | null
          service_duration_tier?: string | null
          single_sided_authorised_by?: string | null
          single_sided_justification?: string | null
          source_system?: string | null
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          active_batch_id?: string | null
          canonical_identity_id?: string
          clock_in?: string | null
          clock_out?: string | null
          confidence_breakdown?: Json
          covers?: number | null
          created_at?: string
          cross_daypart?: boolean
          daypart_distribution?: Json
          dominant_daypart?: string | null
          gross_sales?: number | null
          id?: string
          imported_at?: string | null
          is_active?: boolean
          is_single_sided?: boolean
          labor_basis?: string | null
          labor_cost?: number | null
          labor_span_hours?: number | null
          match_method?: string | null
          needs_review?: boolean
          net_sales?: number | null
          provenance?: Json
          reliability_class?: string | null
          sales_basis?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          service_date?: string
          service_duration_hours?: number | null
          service_duration_source?: string | null
          service_duration_tier?: string | null
          single_sided_authorised_by?: string | null
          single_sided_justification?: string | null
          source_system?: string | null
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_v2_active_batch_id_fkey"
            columns: ["active_batch_id"]
            isOneToOne: false
            referencedRelation: "shift_import_batches_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_v2_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      source_employee_ids: {
        Row: {
          confirmed_at: string
          confirmed_by: string | null
          employee_master_id: string
          id: string
          source_employee_id: string
          source_system: string
          venue_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by?: string | null
          employee_master_id: string
          id?: string
          source_employee_id: string
          source_system: string
          venue_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string | null
          employee_master_id?: string
          id?: string
          source_employee_id?: string
          source_system?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_employee_ids_employee_master_id_fkey"
            columns: ["employee_master_id"]
            isOneToOne: false
            referencedRelation: "employee_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_employee_ids_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_categories: {
        Row: {
          created_at: string
          id: string
          is_legacy: boolean
          key: string
          label: string
          sort_order: number
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_legacy?: boolean
          key: string
          label: string
          sort_order?: number
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_legacy?: boolean
          key?: string
          label?: string
          sort_order?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_categories_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_column_mappings: {
        Row: {
          created_at: string
          id: string
          mapping: Json
          source_type: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mapping?: Json
          source_type: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mapping?: Json
          source_type?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_column_mappings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_daypart_windows: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_week: number
          daypart: string
          effective_from: string
          effective_to: string | null
          end_time: string
          id: string
          start_time: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_week: number
          daypart: string
          effective_from?: string
          effective_to?: string | null
          end_time: string
          id?: string
          start_time: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_week?: number
          daypart?: string
          effective_from?: string
          effective_to?: string | null
          end_time?: string
          id?: string
          start_time?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_daypart_windows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_identity_aliases: {
        Row: {
          alias_name: string
          canonical_identity_id: string
          created_at: string
          id: string
          normalised_alias: string
          source: string | null
          venue_id: string
        }
        Insert: {
          alias_name: string
          canonical_identity_id: string
          created_at?: string
          id?: string
          normalised_alias: string
          source?: string | null
          venue_id: string
        }
        Update: {
          alias_name?: string
          canonical_identity_id?: string
          created_at?: string
          id?: string
          normalised_alias?: string
          source?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_identity_aliases_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_identity_candidates: {
        Row: {
          candidate_identity_id: string | null
          created_at: string
          id: string
          proposed_name: string
          resolved_at: string | null
          resolved_by: string | null
          similarity: number | null
          staging_row_id: string | null
          status: string
          venue_id: string
        }
        Insert: {
          candidate_identity_id?: string | null
          created_at?: string
          id?: string
          proposed_name: string
          resolved_at?: string | null
          resolved_by?: string | null
          similarity?: number | null
          staging_row_id?: string | null
          status?: string
          venue_id: string
        }
        Update: {
          candidate_identity_id?: string | null
          created_at?: string
          id?: string
          proposed_name?: string
          resolved_at?: string | null
          resolved_by?: string | null
          similarity?: number | null
          staging_row_id?: string | null
          status?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_identity_candidates_staging_row_id_fkey"
            columns: ["staging_row_id"]
            isOneToOne: false
            referencedRelation: "shift_staging_rows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_identity_candidates_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_identity_mappings: {
        Row: {
          canonical_identity_id: string
          confirmed_at: string
          confirmed_by: string | null
          external_id: string
          external_system: string
          id: string
          venue_id: string
        }
        Insert: {
          canonical_identity_id: string
          confirmed_at?: string
          confirmed_by?: string | null
          external_id: string
          external_system: string
          id?: string
          venue_id: string
        }
        Update: {
          canonical_identity_id?: string
          confirmed_at?: string
          confirmed_by?: string | null
          external_id?: string
          external_system?: string
          id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_identity_mappings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_members: {
        Row: {
          id: string
          joined_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_members_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_menu: {
        Row: {
          id: string
          menu_text: string
          parsed_items: Json | null
          updated_at: string
          uploaded_at: string
          venue_id: string
        }
        Insert: {
          id?: string
          menu_text: string
          parsed_items?: Json | null
          updated_at?: string
          uploaded_at?: string
          venue_id: string
        }
        Update: {
          id?: string
          menu_text?: string
          parsed_items?: Json | null
          updated_at?: string
          uploaded_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_menu_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_opportunity_factors: {
        Row: {
          created_at: string
          day_of_week: number
          daypart: string
          factor: number
          id: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          daypart: string
          factor?: number
          id?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          daypart?: string
          factor?: number
          id?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_opportunity_factors_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_pairings: {
        Row: {
          category: string
          generated_at: string
          id: string
          item: string
          pair_with: string
          position: number
          priority: string | null
          venue_id: string
          why: string | null
        }
        Insert: {
          category: string
          generated_at?: string
          id?: string
          item: string
          pair_with: string
          position?: number
          priority?: string | null
          venue_id: string
          why?: string | null
        }
        Update: {
          category?: string
          generated_at?: string
          id?: string
          item?: string
          pair_with?: string
          position?: number
          priority?: string | null
          venue_id?: string
          why?: string | null
        }
        Relationships: []
      }
      venue_pos_attribution_config: {
        Row: {
          block_pct: number
          created_at: string
          review_pct: number
          updated_at: string
          updated_by: string | null
          venue_id: string
          warning_pct: number
        }
        Insert: {
          block_pct?: number
          created_at?: string
          review_pct?: number
          updated_at?: string
          updated_by?: string | null
          venue_id: string
          warning_pct?: number
        }
        Update: {
          block_pct?: number
          created_at?: string
          review_pct?: number
          updated_at?: string
          updated_by?: string | null
          venue_id?: string
          warning_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_pos_attribution_config_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_pos_control_totals: {
        Row: {
          business_date: string
          created_at: string
          daypart: string | null
          id: string
          pos_covers: number | null
          pos_gross_sales: number | null
          pos_net_sales: number | null
          source_filename: string | null
          updated_at: string
          uploaded_by: string | null
          venue_id: string
        }
        Insert: {
          business_date: string
          created_at?: string
          daypart?: string | null
          id?: string
          pos_covers?: number | null
          pos_gross_sales?: number | null
          pos_net_sales?: number | null
          source_filename?: string | null
          updated_at?: string
          uploaded_by?: string | null
          venue_id: string
        }
        Update: {
          business_date?: string
          created_at?: string
          daypart?: string | null
          id?: string
          pos_covers?: number | null
          pos_gross_sales?: number | null
          pos_net_sales?: number | null
          source_filename?: string | null
          updated_at?: string
          uploaded_by?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_pos_control_totals_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_service_periods: {
        Row: {
          confidence: number | null
          daypart: string
          derived_at: string
          duration_hours: number | null
          duration_source: string
          id: string
          observed_end: string | null
          observed_start: string | null
          service_date: string
          shift_count: number | null
          venue_id: string
        }
        Insert: {
          confidence?: number | null
          daypart: string
          derived_at?: string
          duration_hours?: number | null
          duration_source: string
          id?: string
          observed_end?: string | null
          observed_start?: string | null
          service_date: string
          shift_count?: number | null
          venue_id: string
        }
        Update: {
          confidence?: number | null
          daypart?: string
          derived_at?: string
          duration_hours?: number | null
          duration_source?: string
          id?: string
          observed_end?: string | null
          observed_start?: string | null
          service_date?: string
          shift_count?: number | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_service_periods_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_settings: {
        Row: {
          allow_assistant_manager_priorities: boolean
          amber_threshold: number
          bottled_water_on: boolean
          cover_capacity: number | null
          created_at: string
          cuisine: string | null
          currency: string | null
          green_threshold: number
          head_office_aggregated_only: boolean
          id: string
          labor_system: string | null
          lls_amber_threshold: number
          lls_green_threshold: number
          managers_see_estimated_uplift: boolean
          market: string | null
          pos_system: string | null
          premium_mains_on: boolean
          send_weekly_push_notifications: boolean
          servers_see_percentages_only: boolean
          updated_at: string
          venue_id: string
        }
        Insert: {
          allow_assistant_manager_priorities?: boolean
          amber_threshold?: number
          bottled_water_on?: boolean
          cover_capacity?: number | null
          created_at?: string
          cuisine?: string | null
          currency?: string | null
          green_threshold?: number
          head_office_aggregated_only?: boolean
          id?: string
          labor_system?: string | null
          lls_amber_threshold?: number
          lls_green_threshold?: number
          managers_see_estimated_uplift?: boolean
          market?: string | null
          pos_system?: string | null
          premium_mains_on?: boolean
          send_weekly_push_notifications?: boolean
          servers_see_percentages_only?: boolean
          updated_at?: string
          venue_id: string
        }
        Update: {
          allow_assistant_manager_priorities?: boolean
          amber_threshold?: number
          bottled_water_on?: boolean
          cover_capacity?: number | null
          created_at?: string
          cuisine?: string | null
          currency?: string | null
          green_threshold?: number
          head_office_aggregated_only?: boolean
          id?: string
          labor_system?: string | null
          lls_amber_threshold?: number
          lls_green_threshold?: number
          managers_see_estimated_uplift?: boolean
          market?: string | null
          pos_system?: string | null
          premium_mains_on?: boolean
          send_weekly_push_notifications?: boolean
          servers_see_percentages_only?: boolean
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_settings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          created_at: string
          id: string
          join_code: string
          lls_active_model_version: string
          lls_compare_mode: boolean
          lls_v2_baseline_weeks: number
          manager_id: string
          name: string
          organisation_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code: string
          lls_active_model_version?: string
          lls_compare_mode?: boolean
          lls_v2_baseline_weeks?: number
          manager_id: string
          name: string
          organisation_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          lls_active_model_version?: string
          lls_compare_mode?: boolean
          lls_v2_baseline_weeks?: number
          manager_id?: string
          name?: string
          organisation_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venues_organisation_id_fkey"
            columns: ["organisation_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_priorities: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          category: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          evidence: Json
          expected_behaviour: string | null
          expected_impact: string | null
          expected_impact_basis: string
          id: string
          item_name: string
          priority_flag: string
          reason: string | null
          recommendation_confidence: string | null
          rejected_at: string | null
          rejected_reason: string | null
          sent_to_servers_at: string | null
          server_group: string | null
          source_menu_id: string | null
          source_suggestion_id: string | null
          start_date: string | null
          status: string
          title: string | null
          venue_id: string
          week_start: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          evidence?: Json
          expected_behaviour?: string | null
          expected_impact?: string | null
          expected_impact_basis?: string
          id?: string
          item_name: string
          priority_flag?: string
          reason?: string | null
          recommendation_confidence?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          sent_to_servers_at?: string | null
          server_group?: string | null
          source_menu_id?: string | null
          source_suggestion_id?: string | null
          start_date?: string | null
          status?: string
          title?: string | null
          venue_id: string
          week_start: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          evidence?: Json
          expected_behaviour?: string | null
          expected_impact?: string | null
          expected_impact_basis?: string
          id?: string
          item_name?: string
          priority_flag?: string
          reason?: string | null
          recommendation_confidence?: string | null
          rejected_at?: string | null
          rejected_reason?: string | null
          sent_to_servers_at?: string | null
          server_group?: string | null
          source_menu_id?: string | null
          source_suggestion_id?: string | null
          start_date?: string | null
          status?: string
          title?: string | null
          venue_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_priorities_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_lls_for_shift: {
        Args: { p_shift_id: string }
        Returns: undefined
      }
      calculate_performance_colour: {
        Args: { actual: number; target: number }
        Returns: string
      }
      claim_manager_account: {
        Args: { _business_name: string }
        Returns: string
      }
      claim_manager_account_for: {
        Args: { _business_name: string; _user_id: string }
        Returns: string
      }
      claim_placeholder_data: { Args: never; Returns: Json }
      csv_number: { Args: { _key: string; _row: Json }; Returns: number }
      delete_csv_uploads: {
        Args: { _venue_id: string; _weeks?: string[] }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_unique_join_code: { Args: never; Returns: string }
      get_leaderboard_position: {
        Args: { _venue_id: string; _week_start: string }
        Returns: {
          my_position: number
          total_servers: number
        }[]
      }
      get_my_accessible_venues: {
        Args: never
        Returns: {
          access_source: string
          id: string
          join_code: string
          name: string
          organisation_id: string
        }[]
      }
      get_my_manager_venue: {
        Args: never
        Returns: {
          id: string
          join_code: string
          name: string
        }[]
      }
      has_active_subscription: {
        Args: { check_env?: string; user_uuid: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_venue_manager: { Args: { _venue_id: string }; Returns: boolean }
      is_venue_member: { Args: { _venue_id: string }; Returns: boolean }
      join_venue_with_code: { Args: { _code: string }; Returns: string }
      latest_venue_stats_week: { Args: { p_venue_id: string }; Returns: string }
      lls_v2_approve_batch: { Args: { _batch_id: string }; Returns: Json }
      lls_v2_authorise_single_sided: {
        Args: { _justification: string; _staging_row_id: string }
        Returns: undefined
      }
      lls_v2_commit_batch: { Args: { _batch_id: string }; Returns: Json }
      lls_v2_ingest_batch: {
        Args: { _payload: Json; _venue_id: string }
        Returns: string
      }
      lls_v2_is_manager: { Args: { _venue_id: string }; Returns: boolean }
      lls_v2_recalculate_canonical_totals: {
        Args: { _shift_id: string }
        Returns: undefined
      }
      lls_v2_refresh_service_periods: {
        Args: { _from: string; _to: string; _venue_id: string }
        Returns: number
      }
      lls_v2_resolve_duplicate: {
        Args: { _decision: string; _staging_row_id: string }
        Returns: undefined
      }
      lls_v2_resolve_identity: {
        Args: { _decision: Json; _staging_row_id: string }
        Returns: undefined
      }
      lls_v2_rollback_batch: { Args: { _batch_id: string }; Returns: Json }
      lls_v2_run_reconciliation: {
        Args: { _batch_id: string; _venue_id: string }
        Returns: Json
      }
      lls_v2_supersede_batch: {
        Args: { _batch_id: string }
        Returns: undefined
      }
      lls_v2_upsert_daypart_window: {
        Args: {
          _day_of_week: number
          _daypart: string
          _effective_from?: string
          _end_time: string
          _start_time: string
          _venue_id: string
        }
        Returns: string
      }
      merge_server_account_data: {
        Args: { _from_user_id: string; _to_user_id: string; _venue_id: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      normalize_person_name: { Args: { _name: string }; Returns: string }
      process_csv_upload: {
        Args: { _csv_data: Json; _venue_id: string; _week_start: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      recalculate_lls_for_week: {
        Args: { p_venue_id: string; p_week_start: string }
        Returns: number
      }
      recompute_ai_targets: { Args: { _venue_id: string }; Returns: undefined }
      record_login: { Args: never; Returns: undefined }
      regenerate_venue_join_code: {
        Args: { _venue_id: string }
        Returns: string
      }
      slugify_category: { Args: { _label: string }; Returns: string }
      update_streaks_and_milestones: {
        Args: { _user_id: string; _venue_id: string; _week_start: string }
        Returns: undefined
      }
      user_can_access_venue: {
        Args: { _user_id: string; _venue_id: string }
        Returns: boolean
      }
      venue_weekly_leaderboard: {
        Args: { p_venue_id: string; p_week_start: string }
        Returns: {
          current_by_category: Json
          current_sales: number
          fourwk_avg_sales: number
          full_name: string
          prev_sales: number
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "manager" | "server" | "head_office"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["manager", "server", "head_office"],
    },
  },
} as const
