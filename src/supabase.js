import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tnklzsmurhmyiqaborni.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRua2x6c211cmhteWlxYWJvcm5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNzIzMjMsImV4cCI6MjA5NDk0ODMyM30.-Nk-V9K56KUHw9pFv2Xj7gpuOFPWljGxIksE-zSXSG4'

export const supabase = createClient(supabaseUrl, supabaseKey)
