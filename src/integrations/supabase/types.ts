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
      server_coaching: {
        Row: {
          generated_at: string
          id: string
          suggestions: Json
          user_id: string
          venue_id: string
          week_start: string
        }
        Insert: {
          generated_at?: string
          id?: string
          suggestions?: Json
          user_id: string
          venue_id: string
          week_start: string
        }
        Update: {
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
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status: string
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
          paddle_customer_id: string
          paddle_subscription_id: string
          price_id: string
          product_id: string
          status?: string
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
          paddle_customer_id?: string
          paddle_subscription_id?: string
          price_id?: string
          product_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
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
      venue_settings: {
        Row: {
          allow_assistant_manager_priorities: boolean
          amber_threshold: number
          bottled_water_on: boolean
          cover_capacity: number | null
          created_at: string
          cuisine: string | null
          green_threshold: number
          head_office_aggregated_only: boolean
          id: string
          managers_see_estimated_uplift: boolean
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
          green_threshold?: number
          head_office_aggregated_only?: boolean
          id?: string
          managers_see_estimated_uplift?: boolean
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
          green_threshold?: number
          head_office_aggregated_only?: boolean
          id?: string
          managers_see_estimated_uplift?: boolean
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
          manager_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          join_code: string
          manager_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          join_code?: string
          manager_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      weekly_priorities: {
        Row: {
          category: string | null
          created_at: string
          id: string
          item_name: string
          priority_flag: string
          venue_id: string
          week_start: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          item_name: string
          priority_flag?: string
          venue_id: string
          week_start: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          item_name?: string
          priority_flag?: string
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
      generate_unique_join_code: { Args: never; Returns: string }
      get_leaderboard_position: {
        Args: { _venue_id: string; _week_start: string }
        Returns: {
          my_position: number
          total_servers: number
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
      merge_server_account_data: {
        Args: { _from_user_id: string; _to_user_id: string; _venue_id: string }
        Returns: number
      }
      normalize_person_name: { Args: { _name: string }; Returns: string }
      process_csv_upload: {
        Args: { _csv_data: Json; _venue_id: string; _week_start: string }
        Returns: Json
      }
      recompute_ai_targets: { Args: { _venue_id: string }; Returns: undefined }
      record_login: { Args: never; Returns: undefined }
      regenerate_venue_join_code: {
        Args: { _venue_id: string }
        Returns: string
      }
      update_streaks_and_milestones: {
        Args: { _user_id: string; _venue_id: string; _week_start: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "manager" | "server"
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
      app_role: ["manager", "server"],
    },
  },
} as const
