import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Lock, User, Building2, Factory, ArrowRight, Check, AlertCircle, Eye, EyeOff, Loader2, Sun, Moon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getPasswordRequirements, getUnmetRequirementLabels } from "@/lib/passwordValidation";
import { apiClient } from "@/services/api/client";
import { useAppTheme } from "@/hooks/useAppTheme";
import { OrgReviewNotice } from "./OrgReviewNotice";
import type { OrgReviewBlock } from "../orgReview";

const industries = [
  "Aerospace & Defense",
  "Agriculture & Food Tech",
  "Automotive",
  "Construction & Infrastructure",
  "Consumer Electronics",
  "Energy & Utilities",
  "Healthcare",
  "Industrial Equipment",
  "Information Technology & Software",
  "IoT & Smart Devices",
  "Manufacturing",
  "Medical Devices",
  "Robotics",
  "Telecommunications",
  "Other",
];

const Signup = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite");
  const { signUp, isLoading: authLoading } = useAuth();
  const { theme, changeTheme } = useAppTheme();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when this email already has an organization awaiting (or refused) approval.
  // Replaces the form: re-submitting it cannot help them.
  const [orgReview, setOrgReview] = useState<OrgReviewBlock | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    companyName: "",
    industry: "",
  });
  const [otherIndustry, setOtherIndustry] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteOrgName, setInviteOrgName] = useState<string>('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Validate invite token, pre-fill and lock the email
  useEffect(() => {
    if (!inviteToken) return;
    localStorage.setItem('pending_invite_token', inviteToken);
    setInviteLoading(true);
    apiClient.get<any>(`/invitations/lookup?invite=${encodeURIComponent(inviteToken)}`)
      .then((data) => {
        setInviteEmail(data.email || '');
        setInviteOrgName(data.organizationName || '');
        setFormData(prev => ({ ...prev, email: data.email || '' }));
      })
      .catch(() => {
        setInviteError('This invitation is invalid, expired, or already used.');
        localStorage.removeItem('pending_invite_token');
      })
      .finally(() => setInviteLoading(false));
  }, [inviteToken]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const reportError = (message: string, details?: unknown) => {
      console.error("Signup error:", message, details);
      setError(message);
    };

    if (formData.fullName.trim().length < 2) {
      setError("Full name must be at least 2 characters");
      return;
    }

    if (formData.password !== formData.password.trim()) {
      setError("Password cannot start or end with spaces");
      return;
    }

    const unmetLabels = getUnmetRequirementLabels(formData.password);
    if (unmetLabels.length > 0) {
      setError(`Password is too weak. Missing: ${unmetLabels.join(", ")}`);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!isInviteSignup && formData.companyName.trim().length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }

    if (!isInviteSignup && !formData.industry) {
      setError("Please select your industry");
      return;
    }

    if (!isInviteSignup && formData.industry === "Other" && !otherIndustry.trim()) {
      setError("Please specify your industry");
      return;
    }

    setIsLoading(true);

    try {
      // Use the unified signUp for both invite and regular signups
      const industryValue = formData.industry === "Other" ? otherIndustry.trim() : formData.industry;
      const result = await signUp(formData.email, formData.password, {
        name: formData.fullName,
        company: formData.companyName,
        industry: industryValue,
      });

      // Re-registering an email whose organization is already under review comes
      // back as a review block rather than a duplicate-email conflict — explain
      // that instead of telling them the email is taken.
      if (result.orgReview) {
        setOrgReview(result.orgReview);
        return;
      }

      if (result.error) {
        reportError(result.error.message || 'Registration failed', result.error);
        return;
      }

      try {
        sessionStorage.setItem(
          'openplan_pending_verify',
          JSON.stringify({ email: formData.email })
        );
      } catch {
        // sessionStorage may be unavailable in restricted browser contexts.
      }

      navigate("/verify-email", { state: { email: formData.email } });
    } catch (err: any) {
      const apiMessage = err?.response?.data?.error?.message || err?.response?.data?.message;
      const errorMessage = apiMessage || (err instanceof Error ? err.message : 'An error occurred');
      reportError(errorMessage, err);
    } finally {
      setIsLoading(false);
    }
  };

  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0;
  const isInviteSignup = !!inviteToken;

  const cycleTheme = () => {
    changeTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="min-h-screen bg-background flex relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-4 right-4 z-10 h-9 w-9"
        onClick={cycleTheme}
        title={`Theme: ${theme} (click to toggle)`}
      >
        {theme === 'dark' ? (
          <Moon className="h-4 w-4" />
        ) : (
          <Sun className="h-4 w-4" />
        )}
        <span className="sr-only">Toggle theme</span>
      </Button>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary/10 via-primary/5 to-background items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Logo className="h-7 w-7 text-primary-foreground" />
            </div>
            <span className="text-3xl font-bold text-foreground">OpenPlan AI</span>
          </div>
          <h1 className="text-4xl font-bold text-foreground leading-tight">
            {isInviteSignup
              ? "You've been invited to join a team"
              : "Start managing your hardware projects today"}
          </h1>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Visual project tracking</p>
                <p className="text-sm text-muted-foreground">Kanban, Gantt, and timeline views for every project</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Dependency management</p>
                <p className="text-sm text-muted-foreground">Visualize and manage complex task relationships</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">AI-powered insights</p>
                <p className="text-sm text-muted-foreground">Get intelligent recommendations for your workflow</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">Team collaboration</p>
                <p className="text-sm text-muted-foreground">Work together seamlessly across departments</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Signup Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-y-auto hide-scrollbar">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader className="space-y-1 text-center pb-4">
            <div className="flex items-center justify-center gap-2 lg:hidden mb-4">
              <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
                <Logo className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">OpenPlan AI</span>
            </div>
            {!orgReview && (
              <>
                <CardTitle className="text-2xl font-bold">
                  {isInviteSignup ? "Join your team" : "Create your account"}
                </CardTitle>
                <CardDescription>
                  {isInviteSignup
                    ? "Create an account to accept your team invitation"
                    : "Get started with a 14-day free trial"}
                </CardDescription>
              </>
            )}
          </CardHeader>

          {/* This email already has an organization in review — resubmitting the
              form would only produce the same result. */}
          {orgReview ? (
            <CardContent className="pb-8">
              <OrgReviewNotice review={orgReview} />
              <Button
                variant="link"
                className="mt-2 w-full text-muted-foreground"
                onClick={() => navigate("/login")}
              >
                Back to sign in
              </Button>
            </CardContent>
          ) : (
          <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') e.preventDefault(); }}>
            <CardContent className="space-y-3 pb-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isInviteSignup && inviteLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating invitation...
                </div>
              )}

              {isInviteSignup && !inviteLoading && !inviteError && inviteOrgName && (
                <Alert className="border-primary/40 bg-primary/5">
                  <Mail className="h-4 w-4 text-primary" />
                  <AlertDescription>
                    You've been invited to join <strong>{inviteOrgName}</strong>. Create your account to get started.
                  </AlertDescription>
                </Alert>
              )}

              {inviteError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {inviteError}{' '}
                    <Link to="/login" className="underline">Go to login</Link>
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Smith"
                    value={formData.fullName}
                    onChange={(e) => handleChange("fullName", e.target.value)}
                    className="pl-10"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">
                  Work Email
                  {inviteEmail && <span className="ml-2 text-xs text-muted-foreground font-normal">(locked to invited address)</span>}
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={formData.email}
                    onChange={(e) => !inviteEmail && handleChange("email", e.target.value)}
                    className={cn("pl-10", inviteEmail && "bg-muted cursor-not-allowed")}
                    required
                    readOnly={!!inviteEmail}
                    disabled={isLoading || !!inviteEmail}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => handleChange("password", e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {formData.password.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {getPasswordRequirements(formData.password).map((req, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <div className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              req.met ? "bg-green-500" : "bg-muted-foreground/30"
                            )} />
                            <span className={cn(
                              "text-[10px] leading-none transition-colors",
                              req.met ? "text-green-600 font-medium" : "text-muted-foreground"
                            )}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={formData.confirmPassword}
                      onChange={(e) => handleChange("confirmPassword", e.target.value)}
                      className={cn(
                        "pl-10 pr-10",
                        formData.confirmPassword && (passwordsMatch ? "border-green-500" : "border-red-500")
                      )}
                      required
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      title={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {!isInviteSignup && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="companyName">Organization Name</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="companyName"
                        type="text"
                        placeholder="Acme Inc."
                        value={formData.companyName}
                        onChange={(e) => handleChange("companyName", e.target.value)}
                        className="pl-10"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="industry">Industry</Label>
                    <div className="relative">
                      <Factory className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                      <Select
                        value={formData.industry}
                        onValueChange={(value) => {
                          handleChange("industry", value);
                          if (value !== "Other") setOtherIndustry("");
                        }}
                        required
                        disabled={isLoading}
                      >
                        <SelectTrigger className="pl-10">
                          <SelectValue placeholder="Select your industry" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border shadow-lg z-50">
                          {industries.map((industry) => (
                            <SelectItem key={industry} value={industry}>
                              {industry}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formData.industry === "Other" && (
                      <Input
                        type="text"
                        placeholder="Please specify your industry"
                        value={otherIndustry}
                        onChange={(e) => setOtherIndustry(e.target.value)}
                        disabled={isLoading}
                        autoFocus
                      />
                    )}
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col gap-3 pb-6">
              <Button type="submit" className="w-full" disabled={isLoading || authLoading || inviteLoading || !!inviteError}>
                {isLoading ? (
                  "Creating account..."
                ) : (
                  <>
                    {isInviteSignup ? "Create account & join team" : "Create account"}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By creating an account, you agree to our{" "}
                <a
                  href="https://www.openplanai.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Terms of Service
                </a>
                {" "}and{" "}
                <a
                  href="https://www.openplanai.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Privacy Policy
                </a>
              </p>
              {!isInviteSignup && (
                <p className="text-sm text-muted-foreground text-center">
                  Already have an account?{" "}
                  <Link
                    to="/login"
                    className="text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    Sign in
                  </Link>
                </p>
              )}
            </CardFooter>
          </form>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Signup;
