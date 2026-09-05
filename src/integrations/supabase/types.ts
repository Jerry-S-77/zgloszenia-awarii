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
      awarie: {
        Row: {
          created_at: string
          czas_przestoju_h: number | null
          data_awarii: string
          data_zamkniecia: string | null
          id: string
          krytycznosc_skutku: string
          nazwa_urzadzenia: string
          nr_technologiczny: string
          opis_awarii: string
          osoba_zglaszajaca_id: string | null
          przyczyna: string | null
          status: string
        }
        Insert: {
          created_at?: string
          czas_przestoju_h?: number | null
          data_awarii?: string
          data_zamkniecia?: string | null
          id?: string
          krytycznosc_skutku: string
          nazwa_urzadzenia: string
          nr_technologiczny: string
          opis_awarii: string
          osoba_zglaszajaca_id?: string | null
          przyczyna?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          czas_przestoju_h?: number | null
          data_awarii?: string
          data_zamkniecia?: string | null
          id?: string
          krytycznosc_skutku?: string
          nazwa_urzadzenia?: string
          nr_technologiczny?: string
          opis_awarii?: string
          osoba_zglaszajaca_id?: string | null
          przyczyna?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "awarie_nr_technologiczny_fkey"
            columns: ["nr_technologiczny"]
            isOneToOne: false
            referencedRelation: "urzadzenia"
            referencedColumns: ["nr_technologiczny"]
          },
          {
            foreignKeyName: "awarie_osoba_zglaszajaca_id_fkey"
            columns: ["osoba_zglaszajaca_id"]
            isOneToOne: false
            referencedRelation: "pracownicy"
            referencedColumns: ["id"]
          },
        ]
      }
      pracownicy: {
        Row: {
          created_at: string
          id: string
          imie_nazwisko: string
        }
        Insert: {
          created_at?: string
          id?: string
          imie_nazwisko: string
        }
        Update: {
          created_at?: string
          id?: string
          imie_nazwisko?: string
        }
        Relationships: []
      }
      urzadzenia: {
        Row: {
          created_at: string
          kategoria: string | null
          krytycznosc: string | null
          lokalizacja: string | null
          nazwa_urzadzenia: string
          nr_technologiczny: string
          status_w_rejestrze: string
          wlasciciel: string | null
        }
        Insert: {
          created_at?: string
          kategoria?: string | null
          krytycznosc?: string | null
          lokalizacja?: string | null
          nazwa_urzadzenia: string
          nr_technologiczny: string
          status_w_rejestrze?: string
          wlasciciel?: string | null
        }
        Update: {
          created_at?: string
          kategoria?: string | null
          krytycznosc?: string | null
          lokalizacja?: string | null
          nazwa_urzadzenia?: string
          nr_technologiczny?: string
          status_w_rejestrze?: string
          wlasciciel?: string | null
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
