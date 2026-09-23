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
      awarie_historia: {
        Row: {
          autor_id: string | null;
          awaria_id: string;
          created_at: string;
          dane: Json;
          id: string;
          typ: Database["public"]["Enums"]["typ_historii_awarii"];
        };
        Insert: {
          autor_id?: string | null;
          awaria_id: string;
          created_at?: string;
          dane?: Json;
          id?: string;
          typ: Database["public"]["Enums"]["typ_historii_awarii"];
        };
        Update: {
          autor_id?: string | null;
          awaria_id?: string;
          created_at?: string;
          dane?: Json;
          id?: string;
          typ?: Database["public"]["Enums"]["typ_historii_awarii"];
        };
        Relationships: [
          {
            foreignKeyName: "awarie_historia_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "awarie_historia_awaria_id_fkey";
            columns: ["awaria_id"];
            isOneToOne: false;
            referencedRelation: "awarie";
            referencedColumns: ["id"];
          },
        ];
      };
      awarie_komentarze: {
        Row: {
          autor_id: string | null;
          awaria_id: string;
          created_at: string;
          id: string;
          tresc: string;
        };
        Insert: {
          autor_id?: string | null;
          awaria_id: string;
          created_at?: string;
          id?: string;
          tresc: string;
        };
        Update: {
          autor_id?: string | null;
          awaria_id?: string;
          created_at?: string;
          id?: string;
          tresc?: string;
        };
        Relationships: [
          {
            foreignKeyName: "awarie_komentarze_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "awarie_komentarze_awaria_id_fkey";
            columns: ["awaria_id"];
            isOneToOne: false;
            referencedRelation: "awarie";
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
      przeglady: {
        Row: {
          created_at: string;
          czestotliwosc_dni: number | null;
          data_najblizszego: string | null;
          data_ostatniego: string | null;
          id: string;
          nr_technologiczny: string;
          typ_czynnosci: string | null;
          uwagi: string | null;
          wykonawca: string | null;
        };
        Insert: {
          created_at?: string;
          czestotliwosc_dni?: number | null;
          data_najblizszego?: string | null;
          data_ostatniego?: string | null;
          id?: string;
          nr_technologiczny: string;
          typ_czynnosci?: string | null;
          uwagi?: string | null;
          wykonawca?: string | null;
        };
        Update: {
          created_at?: string;
          czestotliwosc_dni?: number | null;
          data_najblizszego?: string | null;
          data_ostatniego?: string | null;
          id?: string;
          nr_technologiczny?: string;
          typ_czynnosci?: string | null;
          uwagi?: string | null;
          wykonawca?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "przeglady_nr_technologiczny_fkey";
            columns: ["nr_technologiczny"];
            isOneToOne: false;
            referencedRelation: "urzadzenia";
            referencedColumns: ["nr_technologiczny"];
          },
        ];
      };
      przeglady_propozycje: {
        Row: {
          created_at: string;
          decyzja_at: string | null;
          decyzja_id: string | null;
          id: string;
          powod: Json;
          proponowany_termin: string | null;
          przeglad_id: string;
          status: Database["public"]["Enums"]["status_propozycji"];
        };
        Insert: {
          created_at?: string;
          decyzja_at?: string | null;
          decyzja_id?: string | null;
          id?: string;
          powod?: Json;
          proponowany_termin?: string | null;
          przeglad_id: string;
          status?: Database["public"]["Enums"]["status_propozycji"];
        };
        Update: {
          created_at?: string;
          decyzja_at?: string | null;
          decyzja_id?: string | null;
          id?: string;
          powod?: Json;
          proponowany_termin?: string | null;
          przeglad_id?: string;
          status?: Database["public"]["Enums"]["status_propozycji"];
        };
        Relationships: [
          {
            foreignKeyName: "przeglady_propozycje_decyzja_id_fkey";
            columns: ["decyzja_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "przeglady_propozycje_przeglad_id_fkey";
            columns: ["przeglad_id"];
            isOneToOne: false;
            referencedRelation: "przeglady";
            referencedColumns: ["id"];
          },
        ];
      };
      przeglady_wykonania: {
        Row: {
          autor_id: string | null;
          created_at: string;
          data_wykonania: string;
          id: string;
          przeglad_id: string;
          uwagi: string | null;
          wykonawca: string | null;
        };
        Insert: {
          autor_id?: string | null;
          created_at?: string;
          data_wykonania: string;
          id?: string;
          przeglad_id: string;
          uwagi?: string | null;
          wykonawca?: string | null;
        };
        Update: {
          autor_id?: string | null;
          created_at?: string;
          data_wykonania?: string;
          id?: string;
          przeglad_id?: string;
          uwagi?: string | null;
          wykonawca?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "przeglady_wykonania_autor_id_fkey";
            columns: ["autor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "przeglady_wykonania_przeglad_id_fkey";
            columns: ["przeglad_id"];
            isOneToOne: false;
            referencedRelation: "przeglady";
            referencedColumns: ["id"];
          },
        ];
      };
      urzadzenia: {
        Row: {
          created_at: string;
          kategoria: string | null;
          krytycznosc: string | null;
          lokalizacja: string | null;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          status: Database["public"]["Enums"]["status_urzadzenia"];
          uwagi: string | null;
          wlasciciel_id: string | null;
          wlasciciel_nazwa: string | null;
        };
        Insert: {
          created_at?: string;
          kategoria?: string | null;
          krytycznosc?: string | null;
          lokalizacja?: string | null;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          status?: Database["public"]["Enums"]["status_urzadzenia"];
          uwagi?: string | null;
          wlasciciel_id?: string | null;
          wlasciciel_nazwa?: string | null;
        };
        Update: {
          created_at?: string;
          kategoria?: string | null;
          krytycznosc?: string | null;
          lokalizacja?: string | null;
          nazwa_urzadzenia?: string;
          nr_technologiczny?: string;
          status?: Database["public"]["Enums"]["status_urzadzenia"];
          uwagi?: string | null;
          wlasciciel_id?: string | null;
          wlasciciel_nazwa?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "urzadzenia_wlasciciel_id_fkey";
            columns: ["wlasciciel_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      dzis_pl: { Args: never; Returns: string };
      mam_role: {
        Args: { dozwolone: Database["public"]["Enums"]["rola_uzytkownika"][] };
        Returns: boolean;
      };
      moja_rola: {
        Args: never;
        Returns: Database["public"]["Enums"]["rola_uzytkownika"];
      };
      przeglady_decyzja: {
        Args: { p_propozycja_id: string; p_zatwierdz: boolean };
        Returns: undefined;
      };
      przeglady_sprawdz_progi: { Args: { p_nr: string }; Returns: undefined };
      statystyki_progow_urzadzen: {
        Args: never;
        Returns: {
          awarie_90: number;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          przekracza: boolean;
          przestoj_30: number;
          razem: number;
          wysokie_60: number;
        }[];
      };
      urzadzenia_przekraczajace_progi: {
        Args: never;
        Returns: {
          awarie_90: number;
          nazwa_urzadzenia: string;
          nr_technologiczny: string;
          przekracza: boolean;
          przestoj_30: number;
          razem: number;
          wysokie_60: number;
        }[];
      };
      widzi_awarie: { Args: { p_awaria_id: string }; Returns: boolean };
    };
    Enums: {
      rola_uzytkownika: "pracownik" | "technik" | "kierownik" | "admin";
      status_awarii: "zgloszona" | "przyjeta" | "w_naprawie" | "oczekuje_na_czesc" | "zamknieta";
      status_propozycji: "oczekuje" | "zatwierdzona" | "odrzucona" | "nieaktualna";
      status_urzadzenia: "proponowane" | "aktywne" | "wycofane";
      status_uzytkownika: "aktywny" | "zablokowany";
      typ_historii_awarii: "utworzenie" | "zmiana_statusu" | "przypisanie" | "edycja";
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
      status_propozycji: ["oczekuje", "zatwierdzona", "odrzucona", "nieaktualna"],
      status_urzadzenia: ["proponowane", "aktywne", "wycofane"],
      status_uzytkownika: ["aktywny", "zablokowany"],
      typ_historii_awarii: ["utworzenie", "zmiana_statusu", "przypisanie", "edycja"],
    },
  },
} as const;
