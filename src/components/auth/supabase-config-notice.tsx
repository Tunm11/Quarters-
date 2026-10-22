import { TriangleAlert } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { useAuth } from "@/auth/use-auth";
import { SUPABASE_ENV_KEYS } from "@/lib/supabase-config";

/**
 * Shown when the Supabase environment variables are missing or malformed.
 * There is deliberately no fallback client and no mock auth behind this.
 */
export function SupabaseConfigNotice() {
  const { configMissingKeys, configProblem } = useAuth();
  const keys = configMissingKeys.length > 0 ? configMissingKeys : [...SUPABASE_ENV_KEYS];

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8">
      <Panel tone="raised" className="flex flex-col gap-5">
        <span
          aria-hidden="true"
          className="grid size-11 place-items-center rounded-tile border border-caution/30 bg-caution/10 text-caution"
        >
          <TriangleAlert className="size-5" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Supabase is not configured</h1>
          <p className="text-sm leading-relaxed text-muted">
            Authentication is disabled because the app is missing its public
            Supabase configuration. QUARTERS does not fall back to mock accounts
            or sample data.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium tracking-wide text-subtle uppercase">
            Missing or invalid keys
          </p>
          <ul className="flex flex-col gap-2">
            {keys.map((key) => (
              <li key={key}>
                <code className="inline-block rounded-tile border border-line bg-canvas px-2 py-1 text-xs text-foreground">
                  {key}
                </code>
              </li>
            ))}
          </ul>
          {configProblem && <p className="text-xs text-subtle">{configProblem}</p>}
        </div>

        <p className="text-xs leading-relaxed text-subtle">
          Add these values in Settings → Environment (or your local environment
          file), then reload. Use the project URL and the publishable key — never
          a service-role key. Values are read at build time by Vite and are never
          printed by the app.
        </p>
      </Panel>
    </div>
  );
}
