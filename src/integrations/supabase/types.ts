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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_label: string | null
          target_type: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_label?: string | null
          target_type?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      file_shares: {
        Row: {
          content_iv: string
          created_at: string
          download_count: number
          expires_at: string | null
          file_id: string
          id: string
          max_downloads: number | null
          mime_hint: string | null
          name_ciphertext: string
          name_iv: string
          owner_id: string
          password_iterations: number | null
          password_salt: string | null
          revoked: boolean
          sha256: string
          size_bytes: number
          storage_path: string
          token_hash: string
          updated_at: string
          wrap_iv: string
          wrapped_share_key: string
        }
        Insert: {
          content_iv: string
          created_at?: string
          download_count?: number
          expires_at?: string | null
          file_id: string
          id?: string
          max_downloads?: number | null
          mime_hint?: string | null
          name_ciphertext: string
          name_iv: string
          owner_id: string
          password_iterations?: number | null
          password_salt?: string | null
          revoked?: boolean
          sha256: string
          size_bytes: number
          storage_path: string
          token_hash: string
          updated_at?: string
          wrap_iv: string
          wrapped_share_key: string
        }
        Update: {
          content_iv?: string
          created_at?: string
          download_count?: number
          expires_at?: string | null
          file_id?: string
          id?: string
          max_downloads?: number | null
          mime_hint?: string | null
          name_ciphertext?: string
          name_iv?: string
          owner_id?: string
          password_iterations?: number | null
          password_salt?: string | null
          revoked?: boolean
          sha256?: string
          size_bytes?: number
          storage_path?: string
          token_hash?: string
          updated_at?: string
          wrap_iv?: string
          wrapped_share_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_shares_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          content_iv: string
          created_at: string
          file_id: string
          id: string
          mime_hint: string | null
          name_ciphertext: string
          name_iv: string
          note: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
          version_number: number
          wrap_iv: string
          wrapped_key: string
        }
        Insert: {
          content_iv: string
          created_at?: string
          file_id: string
          id?: string
          mime_hint?: string | null
          name_ciphertext: string
          name_iv: string
          note?: string | null
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
          version_number: number
          wrap_iv: string
          wrapped_key: string
        }
        Update: {
          content_iv?: string
          created_at?: string
          file_id?: string
          id?: string
          mime_hint?: string | null
          name_ciphertext?: string
          name_iv?: string
          note?: string | null
          sha256?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
          version_number?: number
          wrap_iv?: string
          wrapped_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          content_iv: string
          created_at: string
          id: string
          mime_hint: string | null
          name_ciphertext: string
          name_iv: string
          sha256: string
          size_bytes: number
          storage_path: string
          updated_at: string
          user_id: string
          wrap_iv: string
          wrapped_key: string
        }
        Insert: {
          content_iv: string
          created_at?: string
          id?: string
          mime_hint?: string | null
          name_ciphertext: string
          name_iv: string
          sha256: string
          size_bytes: number
          storage_path: string
          updated_at?: string
          user_id: string
          wrap_iv: string
          wrapped_key: string
        }
        Update: {
          content_iv?: string
          created_at?: string
          id?: string
          mime_hint?: string | null
          name_ciphertext?: string
          name_iv?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          updated_at?: string
          user_id?: string
          wrap_iv?: string
          wrapped_key?: string
        }
        Relationships: []
      }
      user_vault: {
        Row: {
          created_at: string
          kdf_iterations: number
          kdf_salt: string
          updated_at: string
          user_id: string
          verifier_ciphertext: string
          verifier_iv: string
        }
        Insert: {
          created_at?: string
          kdf_iterations?: number
          kdf_salt: string
          updated_at?: string
          user_id: string
          verifier_ciphertext: string
          verifier_iv: string
        }
        Update: {
          created_at?: string
          kdf_iterations?: number
          kdf_salt?: string
          updated_at?: string
          user_id?: string
          verifier_ciphertext?: string
          verifier_iv?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
