"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AlertIcon, EyeIcon, Spinner } from "./icons";

const inputClass =
  "block w-full rounded-xl border-0 bg-white px-4 py-3 text-base text-slate-900 shadow-sm ring-1 ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-600 focus:outline-none";

export default function LoginForm({ notice }: { notice: string | null }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    if (!username.trim()) return setError("Please enter your username.");
    if (!password) return setError("Please enter your password.");

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;

      if (response.ok && data?.ok) {
        setPassword("");
        router.replace("/admin");
        router.refresh();
        return; // keep the loading state while navigating
      }
      setError(data?.message ?? "Login failed. Please try again.");
    } catch {
      setError("Could not reach the server. Please check your internet connection.");
    }
    setLoading(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5 rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgb(15_23_42/0.08)] ring-1 ring-slate-200"
    >
      {notice && !error && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200" role="alert">
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-slate-800">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputClass}
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-800">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-14`}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-700"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-wait disabled:opacity-80"
      >
        {loading && <Spinner />}
        {loading ? "Signing in…" : "Log in"}
      </button>
    </form>
  );
}
