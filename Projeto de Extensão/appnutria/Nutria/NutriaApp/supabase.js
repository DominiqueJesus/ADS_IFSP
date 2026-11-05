import 'react-native-get-random-values';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';


const supabaseUrl = 'https://egoceniricvxorzeqihu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnb2NlbmlyaWN2eG9yemVxaWh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NjM2MzcsImV4cCI6MjA4OTIzOTYzN30.YyAsWIgHVi905_DpHcIHCE5q-9Qb8P8csOoxJfpmXZQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
		storage: AsyncStorage,
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: false,
	},
});