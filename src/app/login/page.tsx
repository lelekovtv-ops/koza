"use client"

import { signIn } from "next-auth/react"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()
  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (isRegister) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || "Registration failed")
          setLoading(false)
          return
        }
        // Auto-login after register
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError("Invalid email or password")
        setLoading(false)
        return
      }

      router.push("/")
      router.refresh()
    } catch {
      setError("Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0E0D0C]">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-[24px] font-semibold tracking-tight text-[#E7E3DC]">
          KOZA
        </h1>
        <p className="mb-8 text-center text-[13px] text-white/30">
          {isRegister ? "Create your account" : "Sign in to continue"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegister && (
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[14px] text-[#E7E3DC] placeholder:text-white/20 outline-none focus:border-[#D4A853]/40 transition-colors"
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[14px] text-[#E7E3DC] placeholder:text-white/20 outline-none focus:border-[#D4A853]/40 transition-colors"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-[14px] text-[#E7E3DC] placeholder:text-white/20 outline-none focus:border-[#D4A853]/40 transition-colors"
          />

          {error && (
            <p className="text-[12px] text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-lg bg-[#D4A853] px-4 py-3 text-[13px] font-medium text-[#0E0D0C] transition-colors hover:bg-[#E8C778] disabled:opacity-50"
          >
            {loading ? "..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => { setIsRegister(!isRegister); setError("") }}
          className="mt-4 w-full text-center text-[12px] text-white/30 transition-colors hover:text-white/50"
        >
          {isRegister ? "Already have an account? Sign in" : "Don't have an account? Register"}
        </button>
      </div>
    </div>
  )
}
