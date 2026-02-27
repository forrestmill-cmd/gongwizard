'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Lock, X, Shield, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

function saveSession(data: any) {
  sessionStorage.setItem('gongwizard_session', JSON.stringify(data));
}

export default function ConnectPage() {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!accessKey.trim() || !secretKey.trim()) {
      setError('Both Access Key and Secret Key are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const authHeader = btoa(`${accessKey}:${secretKey}`);
      const res = await fetch('/api/gong/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gong-Auth': authHeader,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to connect to Gong. Check your credentials.');
        setLoading(false);
        return;
      }

      saveSession({ ...data, authHeader });
      router.push('/calls');
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/40 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">GongWizard</h1>
          <p className="text-muted-foreground text-base">Get your Gong calls ready for AI</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Connect to Gong</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleConnect} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessKey">Access Key</Label>
                <Input
                  id="accessKey"
                  type="text"
                  placeholder="Your Gong API access key"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secretKey">Secret Key</Label>
                <div className="relative">
                  <Input
                    id="secretKey"
                    type={showSecret ? 'text' : 'password'}
                    placeholder="Your Gong API secret key"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-md border bg-muted/50">
                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  How to get these
                  {showHelp ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>
                {showHelp && (
                  <div className="border-t px-3 py-3">
                    <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
                      <li>Go to your Gong settings → API → API keys</li>
                      <li>Create a new API key or use an existing one</li>
                      <li>Copy the Access Key and Secret Key</li>
                      <li>Your admin may need to enable API access</li>
                    </ol>
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="size-3.5" />
            Credentials stored in session only
          </span>
          <span className="flex items-center gap-1.5">
            <X className="size-3.5" />
            Cleared when you close this tab
          </span>
          <span className="flex items-center gap-1.5">
            <Shield className="size-3.5" />
            No server-side storage
          </span>
        </div>
      </div>
    </div>
  );
}
