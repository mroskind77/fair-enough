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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_extra: {
        Row: {
          chip: string
          confidence: number | null
          hidden: boolean
          id: string
          imported_at: string
          lat: number
          lon: number
          name: string
          name_he: string | null
          phone: string | null
          source_datasets: string[]
          website: string | null
        }
        Insert: {
          chip: string
          confidence?: number | null
          hidden?: boolean
          id: string
          imported_at?: string
          lat: number
          lon: number
          name: string
          name_he?: string | null
          phone?: string | null
          source_datasets?: string[]
          website?: string | null
        }
        Update: {
          chip?: string
          confidence?: number | null
          hidden?: boolean
          id?: string
          imported_at?: string
          lat?: number
          lon?: number
          name?: string
          name_he?: string | null
          phone?: string | null
          source_datasets?: string[]
          website?: string | null
        }
        Relationships: []
      }
      cache: {
        Row: {
          fetched_at: string
          json: Json
          key: string
          ttl_seconds: number
        }
        Insert: {
          fetched_at?: string
          json: Json
          key: string
          ttl_seconds: number
        }
        Update: {
          fetched_at?: string
          json?: Json
          key?: string
          ttl_seconds?: number
        }
        Relationships: []
      }
      fn_error: {
        Row: {
          action: string | null
          at: string
          cause: string
          fn: string
          id: number
          ms: number | null
          sid: string | null
          status: number
        }
        Insert: {
          action?: string | null
          at?: string
          cause: string
          fn: string
          id?: never
          ms?: number | null
          sid?: string | null
          status: number
        }
        Update: {
          action?: string | null
          at?: string
          cause?: string
          fn?: string
          id?: never
          ms?: number | null
          sid?: string | null
          status?: number
        }
        Relationships: []
      }
      pace: {
        Row: {
          key: string
          tat: string
        }
        Insert: {
          key: string
          tat: string
        }
        Update: {
          key?: string
          tat?: string
        }
        Relationships: []
      }
      rate_counter: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      report: {
        Row: {
          created_at: string
          id: string
          osm_ref: string
          status: string
          text: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          osm_ref: string
          status?: string
          text?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          osm_ref?: string
          status?: string
          text?: string | null
          type?: string
        }
        Relationships: []
      }
      search_pool: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          id: string
          pool: Json
          request: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string
          fingerprint: string
          id?: string
          pool?: Json
          request: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint?: string
          id?: string
          pool?: Json
          request?: Json
        }
        Relationships: []
      }
      share_snapshot: {
        Row: {
          chips: string[]
          created_at: string
          duration_min: number
          expires_at: string
          hide_starts: boolean
          id: string
          kosher: boolean
          lang: string
          meet_at: string
          occasion: string
          og_version: number
          people: Json
          venues: Json
        }
        Insert: {
          chips?: string[]
          created_at?: string
          duration_min: number
          expires_at: string
          hide_starts?: boolean
          id: string
          kosher?: boolean
          lang: string
          meet_at: string
          occasion: string
          og_version?: number
          people: Json
          venues: Json
        }
        Update: {
          chips?: string[]
          created_at?: string
          duration_min?: number
          expires_at?: string
          hide_starts?: boolean
          id?: string
          kosher?: boolean
          lang?: string
          meet_at?: string
          occasion?: string
          og_version?: number
          people?: Json
          venues?: Json
        }
        Relationships: []
      }
      transit_call: {
        Row: {
          at: string
          bytes: number | null
          endpoint: string
          id: number
          ms: number | null
          outcome: string
          sid: string | null
          status: number | null
        }
        Insert: {
          at?: string
          bytes?: number | null
          endpoint: string
          id?: never
          ms?: number | null
          outcome: string
          sid?: string | null
          status?: number | null
        }
        Update: {
          at?: string
          bytes?: number | null
          endpoint?: string
          id?: never
          ms?: number | null
          outcome?: string
          sid?: string | null
          status?: number | null
        }
        Relationships: []
      }
      venue_override: {
        Row: {
          certifier: string | null
          hours_override: string | null
          kosher_status: string
          last_checked_on: string | null
          meat_dairy: string | null
          note: string | null
          osm_ref: string
          source: string | null
        }
        Insert: {
          certifier?: string | null
          hours_override?: string | null
          kosher_status?: string
          last_checked_on?: string | null
          meat_dairy?: string | null
          note?: string | null
          osm_ref: string
          source?: string | null
        }
        Update: {
          certifier?: string | null
          hours_override?: string | null
          kosher_status?: string
          last_checked_on?: string | null
          meat_dairy?: string | null
          note?: string | null
          osm_ref?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      pace_take: {
        Args: {
          p_burst: number
          p_every_ms: number
          p_key: string
          p_max_wait_ms: number
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
