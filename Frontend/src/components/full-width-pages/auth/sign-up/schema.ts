import { isEmail } from '@/composables/useFormValidation'

export interface SignUpFormData {
  fname: string
  lname: string
  email: string
  password: string
  confirmPassword: string
  terms: boolean
}

export const validateSignUp = (data: SignUpFormData) => {
  const errors: Partial<Record<keyof SignUpFormData, string>> = {}

  if (!data.fname.trim()) errors.fname = 'Nama depan wajib diisi'
  if (!data.lname.trim()) errors.lname = 'Nama belakang wajib diisi'

  if (!data.email.trim()) errors.email = 'Email wajib diisi'
  else if (!isEmail(data.email.trim())) errors.email = 'Masukkan alamat email yang valid'

  if (data.password.length < 8) errors.password = 'Kata sandi minimal 8 karakter'

  if (!data.confirmPassword) errors.confirmPassword = 'Konfirmasi kata sandi wajib diisi'
  else if (data.password !== data.confirmPassword) errors.confirmPassword = 'Kata sandi tidak sama'

  if (!data.terms) errors.terms = 'Anda harus menyetujui Syarat dan Ketentuan'

  return errors
}
