import { isEmail } from '@/composables/useFormValidation'

export interface SignInFormData {
  email: string
  password: string
  keepLoggedIn?: boolean
}

export const validateSignIn = (data: SignInFormData) => {
  const errors: Partial<Record<keyof SignInFormData, string>> = {}

  if (!data.email.trim()) errors.email = 'Email wajib diisi'
  else if (!isEmail(data.email.trim())) errors.email = 'Masukkan alamat email yang valid'

  if (!data.password) errors.password = 'Kata sandi wajib diisi'

  return errors
}
