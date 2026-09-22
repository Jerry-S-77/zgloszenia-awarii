// Wygenerowano: npx supabase gen types typescript --project-id <ref> --schema public
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      awarie: {
        Row: {
          created_at: string;
          czas_przestoju_h: number | null;
          data_awarii: string;
          data_zamkniecia: string | null;
          id: string;
          krytycznosc_skutku: string;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          numer: string | null;
          opis_awarii: string;
          przyczyna: string | null;
          przypisany_technik_id: string | null;
          status: Database["public"]["Enums"]["status_awarii"];
          wersja: number;
          zglaszajacy_id: string | null;
          zglaszajacy_nazwa: string | null;
        };
        Insert: {
          created_at?: string;
          czas_przestoju_h?: number | null;
          data_awarii?: string;
          data_zamkniecia?: string | null;
          id?: string;
          krytycznosc_skutku: string;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          numer?: string | null;
          opis_awarii: string;
          przyczyna?: string | null;
          przypisany_technik_id?: string | null;
          status?: Database["public"]["Enums"]["status_awarii"];
          wersja?: number;
          zglaszajacy_id?: string | null;
          zglaszajacy_nazwa?: string | null;
        };
        Update: {
          created_at?: string;
          czas_przestoju_h?: number | null;
          data_awarii?: string;
          data_zamkniecia?: string | null;
          id?: string;
          krytycznosc_skutku?: string;
          nazwa_urzadzenia?: string;
          nr_technologiczny?: string;
          numer?: string | null;
          opis_awarii?: string;
          przyczyna?: string | null;
          przypisany_technik_id?: string | null;
          status?: Database["public"]["Enums"]["status_awarii"];
          wersja?: number;
          zglaszajacy_id?: string | null;
          zglaszajacy_nazwa?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "awarie_nr_technologiczny_fkey";
            columns: ["nr_technologiczny"];
            isOneToOne: false;
            referencedRelation: "urzadzenia";
            referencedColumns: ["nr_technologiczny"];
          },
          {
            foreignKeyName: "awarie_przypisany_technik_id_fkey";
            columns: ["przypisany_technik_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "awarie_zglaszajacy_id_fkey";
            columns: ["zglaszajacy_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      numeracja_awarii: {
        Row: {
          ostatni: number;
          rok: number;
        };
        Insert: {
          ostatni?: number;
          rok: number;
        };
        Update: {
          ostatni?: number;
          rok?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          imie_nazwisko: string;
          must_change_password: boolean;
          rola: Database["public"]["Enums"]["rola_uzytkownika"];
          status: Database["public"]["Enums"]["status_uzytkownika"];
        };
        Insert: {
          created_at?: string;
          email: string;
          id: string;
          imie_nazwisko: string;
          must_change_password?: boolean;
          rola?: Database["public"]["Enums"]["rola_uzytkownika"];
          status?: Database["public"]["Enums"]["status_uzytkownika"];
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          imie_nazwisko?: string;
          must_change_password?: boolean;
          rola?: Database["public"]["Enums"]["rola_uzytkownika"];
          status?: Database["public"]["Enums"]["status_uzytkownika"];
        };
        Relationships: [];
      };
      urzadzenia: {
        Row: {
          created_at: string;
          kategoria: string | null;
          krytycznosc: string | null;
          lokalizacja: string | null;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          status_w_rejestrze: string;
          wlasciciel: string | null;
        };
        Insert: {
          created_at?: string;
          kategoria?: string | null;
          krytycznosc?: string | null;
          lokalizacja?: string | null;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          status_w_rejestrze?: string;
          wlasciciel?: string | null;
        };
        Update: {
          created_at?: string;
          kategoria?: string | null;
          krytycznosc?: string | null;
          lokalizacja?: string | null;
          nazwa_urzadzenia?: string;
          nr_technologiczny?: string;
          status_w_rejestrze?: string;
          wlasciciel?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      mam_role: {
        Args: { dozwolone: Database["public"]["Enums"]["rola_uzytkownika"][] };
        Returns: boolean;
      };
      moja_rola: {
        Args: never;
        Returns: Database["public"]["Enums"]["rola_uzytkownika"];
      };
    };
    Enums: {
      rola_uzytkownika: "pracownik" | "technik" | "kierownik" | "admin";
      status_awarii: "zgloszona" | "przyjeta" | "w_naprawie" | "oczekuje_na_czesc" | "zamknieta";
      status_uzytkownika: "aktywny" | "zablokowany";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      rola_uzytkownika: ["pracownik", "technik", "kierownik", "admin"],
      status_awarii: ["zgloszona", "przyjeta", "w_naprawie", "oczekuje_na_czesc", "zamknieta"],
      status_uzytkownika: ["aktywny", "zablokowany"],
    },
  },
} as const;
