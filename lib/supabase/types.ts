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
      accessories: {
        Row: {
          cost: number | null
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          rented: number
          stock: number
          unavailable_units: number
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          price?: number
          rented?: number
          stock?: number
          unavailable_units?: number
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          rented?: number
          stock?: number
          unavailable_units?: number
        }
        Relationships: []
      }
      booking_accessories: {
        Row: {
          accessory_id: string
          booking_id: string
          price_at_booking: number
        }
        Insert: {
          accessory_id: string
          booking_id: string
          price_at_booking: number
        }
        Update: {
          accessory_id?: string
          booking_id?: string
          price_at_booking?: number
        }
        Relationships: [
          {
            foreignKeyName: "booking_accessories_accessory_id_fkey"
            columns: ["accessory_id"]
            isOneToOne: false
            referencedRelation: "accessories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_accessories_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          address: string | null
          amount: number | null
          contact: string | null
          created_at: string | null
          deliver_time: string | null
          dress_id: string | null
          dress_name: string | null
          end_date: string | null
          fitting_date: string | null
          fitting_time: string | null
          hold_expires_at: string | null
          id: string
          id_photo_url: string | null
          manual: boolean
          parking: boolean | null
          payment_method: string | null
          payment_status: string
          plate: string | null
          proof_url: string | null
          renter_name: string
          start_date: string | null
          type: string
          vehicle: string | null
        }
        Insert: {
          address?: string | null
          amount?: number | null
          contact?: string | null
          created_at?: string | null
          deliver_time?: string | null
          dress_id?: string | null
          dress_name?: string | null
          end_date?: string | null
          fitting_date?: string | null
          fitting_time?: string | null
          hold_expires_at?: string | null
          id?: string
          id_photo_url?: string | null
          manual?: boolean
          parking?: boolean | null
          payment_method?: string | null
          payment_status?: string
          plate?: string | null
          proof_url?: string | null
          renter_name: string
          start_date?: string | null
          type: string
          vehicle?: string | null
        }
        Update: {
          address?: string | null
          amount?: number | null
          contact?: string | null
          created_at?: string | null
          deliver_time?: string | null
          dress_id?: string | null
          dress_name?: string | null
          end_date?: string | null
          fitting_date?: string | null
          fitting_time?: string | null
          hold_expires_at?: string | null
          id?: string
          id_photo_url?: string | null
          manual?: boolean
          parking?: boolean | null
          payment_method?: string | null
          payment_status?: string
          plate?: string | null
          proof_url?: string | null
          renter_name?: string
          start_date?: string | null
          type?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
        ]
      }
      dress_photos: {
        Row: {
          dress_id: string
          id: string
          is_cover: boolean | null
          label: string | null
          sort_order: number | null
          url: string
        }
        Insert: {
          dress_id: string
          id?: string
          is_cover?: boolean | null
          label?: string | null
          sort_order?: number | null
          url: string
        }
        Update: {
          dress_id?: string
          id?: string
          is_cover?: boolean | null
          label?: string | null
          sort_order?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "dress_photos_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
        ]
      }
      dress_sizes: {
        Row: {
          bust_cm: number | null
          dress_id: string
          id: string
          length_cm: number | null
          size: string
          waist_cm: number | null
        }
        Insert: {
          bust_cm?: number | null
          dress_id: string
          id?: string
          length_cm?: number | null
          size: string
          waist_cm?: number | null
        }
        Update: {
          bust_cm?: number | null
          dress_id?: string
          id?: string
          length_cm?: number | null
          size?: string
          waist_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dress_sizes_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
        ]
      }
      dresses: {
        Row: {
          cost: number | null
          created_at: string | null
          id: string
          name: string
          price: number
          status: string
          style_name: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string | null
          id?: string
          name: string
          price?: number
          status?: string
          style_name?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string | null
          id?: string
          name?: string
          price?: number
          status?: string
          style_name?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string | null
          id: string
          name: string
          qr_url: string | null
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          qr_url?: string | null
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          qr_url?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      rental_history: {
        Row: {
          amount_paid: number
          created_at: string | null
          dress_id: string | null
          dress_name: string
          end_date: string
          id: string
          renter_name: string
          start_date: string
        }
        Insert: {
          amount_paid: number
          created_at?: string | null
          dress_id?: string | null
          dress_name: string
          end_date: string
          id?: string
          renter_name: string
          start_date: string
        }
        Update: {
          amount_paid?: number
          created_at?: string | null
          dress_id?: string | null
          dress_name?: string
          end_date?: string
          id?: string
          renter_name?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_history_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          body: string
          created_at: string | null
          dress_id: string
          id: string
          photo_url: string | null
          renter_name: string
        }
        Insert: {
          body: string
          created_at?: string | null
          dress_id: string
          id?: string
          photo_url?: string | null
          renter_name: string
        }
        Update: {
          body?: string
          created_at?: string | null
          dress_id?: string
          id?: string
          photo_url?: string | null
          renter_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      blocked_dates: {
        Row: {
          blocked_day: string | null
          dress_id: string | null
          dress_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_dress_id_fkey"
            columns: ["dress_id"]
            isOneToOne: false
            referencedRelation: "dresses"
            referencedColumns: ["id"]
          },
        ]
      }
      booked_fitting_slots: {
        Row: {
          fitting_date: string | null
          fitting_time: string | null
        }
        Insert: {
          fitting_date?: string | null
          fitting_time?: string | null
        }
        Update: {
          fitting_date?: string | null
          fitting_time?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      attach_rent_payment: {
        Args: {
          p_booking_id: string
          p_payment_method: string
          p_proof_path: string
        }
        Returns: Json
      }
      clear_booking_files: {
        Args: { booking_id: string; clear_id: boolean; clear_proof: boolean }
        Returns: undefined
      }
      create_fitting_booking: {
        Args: {
          p_contact: string
          p_date: string
          p_dress_id: string
          p_name: string
          p_parking: boolean
          p_plate: string
          p_time: string
          p_vehicle: string
        }
        Returns: Json
      }
      create_rent_hold: {
        Args: {
          p_accessory_ids: string[]
          p_address: string
          p_booking_id: string
          p_contact: string
          p_date: string
          p_deliver_time: string
          p_dress_id: string
          p_id_path: string
          p_name: string
        }
        Returns: Json
      }
      get_hold_status: { Args: { p_booking_id: string }; Returns: Json }
      list_invalid_expired_pii: {
        Args: { grace_days: number }
        Returns: {
          id: string
          id_photo_url: string
          proof_url: string
        }[]
      }
      purge_expired_holds: {
        Args: Record<PropertyKey, never>
        Returns: string[]
      }
      release_rent_hold: { Args: { p_booking_id: string }; Returns: undefined }
      verify_cron_secret: { Args: { candidate: string }; Returns: boolean }
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
