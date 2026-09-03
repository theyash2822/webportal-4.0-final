import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, ChevronDown, TrendingUp, Package, ShieldCheck, MessageCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api, { unwrapAuth } from '../../services/api';
import { LANGUAGES } from '../../i18n';
import { useLabelT } from '../../components/kit';

const STATS = [
  ['145', 'Mobile screens matched'],
  ['23', 'Inventory views'],
  ['91', 'Web routes'],
];

const FEATURES = [
  [TrendingUp, 'Registers, day book and drill-downs'],
  [Package, 'Stock across 23 inventory screens'],
  [ShieldCheck, 'GST, e-invoice and e-way bill'],
];

const OTP_LENGTH = 4;
const PIN_LENGTH = 4;

// Same country list as mobile V4 `(auth)/index.tsx`.
const COUNTRIES = [
  { name: 'India',                flag: '🇮🇳', code: '+91',  placeholder: '98765 43210',   minDigits: 10, maxDigits: 10 },
  { name: 'United Arab Emirates', flag: '🇦🇪', code: '+971', placeholder: '50 123 4567',   minDigits: 9,  maxDigits: 9  },
  { name: 'Saudi Arabia',         flag: '🇸🇦', code: '+966', placeholder: '50 123 4567',   minDigits: 9,  maxDigits: 9  },
  { name: 'Kenya',                flag: '🇰🇪', code: '+254', placeholder: '712 345 678',   minDigits: 9,  maxDigits: 9  },
  { name: 'Nigeria',              flag: '🇳🇬', code: '+234', placeholder: '803 123 4567',  minDigits: 10, maxDigits: 10 },
  { name: 'Tanzania',             flag: '🇹🇿', code: '+255', placeholder: '712 345 678',   minDigits: 9,  maxDigits: 9  },
  { name: 'Uganda',               flag: '🇺🇬', code: '+256', placeholder: '712 345 678',   minDigits: 9,  maxDigits: 9  },
  { name: 'Ethiopia',             flag: '🇪🇹', code: '+251', placeholder: '91 234 5678',   minDigits: 9,  maxDigits: 9  },
  { name: 'Zimbabwe',             flag: '🇿🇼', code: '+263', placeholder: '71 234 5678',   minDigits: 9,  maxDigits: 9  },
  { name: 'South Africa',         flag: '🇿🇦', code: '+27',  placeholder: '71 234 5678',   minDigits: 9,  maxDigits: 9  },
  { name: 'Bahrain',              flag: '🇧🇭', code: '+973', placeholder: '3200 1234',     minDigits: 8,  maxDigits: 8  },
  { name: 'Kuwait',               flag: '🇰🇼', code: '+965', placeholder: '5000 1234',     minDigits: 8,  maxDigits: 8  },
  { name: 'Oman',                 flag: '🇴🇲', code: '+968', placeholder: '9123 4567',     minDigits: 8,  maxDigits: 8  },
  { name: 'Qatar',                flag: '🇶🇦', code: '+974', placeholder: '3312 3456',     minDigits: 8,  maxDigits: 8  },
  { name: 'Bangladesh',           flag: '🇧🇩', code: '+880', placeholder: '1812 345678',   minDigits: 10, maxDigits: 10 },
  { name: 'Nepal',                flag: '🇳🇵', code: '+977', placeholder: '984 1234567',   minDigits: 10, maxDigits: 10 },
  { name: 'Sri Lanka',            flag: '🇱🇰', code: '+94',  placeholder: '77 123 4567',   minDigits: 9,  maxDigits: 9  },
  { name: 'Myanmar',              flag: '🇲🇲', code: '+95',  placeholder: '92 123 4567',   minDigits: 9,  maxDigits: 9  },
  { name: 'Zambia',               flag: '🇿🇲', code: '+260', placeholder: '95 123 4567',   minDigits: 9,  maxDigits: 9  },
  { name: 'Malaysia',             flag: '🇲🇾', code: '+60',  placeholder: '12 345 6789',   minDigits: 9,  maxDigits: 10 },
];

function toAuthUser(user) {
  if (!user) return user;
  const phone = user.phone || user.mobile || user.mobileNumber;
  return { ...user, phone, mobile: phone, mobileNumber: phone };
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

export default function Login() {
  const lt = useLabelT();
  const navigate = useNavigate();
  const { login, markPaired } = useAuth();
  // 'mobile' | 'otp' | 'pin' | 'resetotp' | 'newpin' | 'profile'
  const [step, setStep] = useState('mobile');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [preAuthToken, setPreAuthToken] = useState('');
  const [profile, setProfile] = useState({ name: '', email: '', language: 'English' });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pendingSession, setPendingSession] = useState(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpRef = useRef(null);
  const countryRef = useRef(null);

  const cleanMobile = mobile.replace(/\D/g, '');
  const fullPhone = `${country.code}${cleanMobile}`;
  const isValidPhone = cleanMobile.length >= country.minDigits && cleanMobile.length <= country.maxDigits;

  useEffect(() => {
    if (!resendIn) return;
    const t = setTimeout(() => setResendIn(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  useEffect(() => { if (step === 'otp') otpRef.current?.focus(); }, [step]);

  useEffect(() => {
    if (!showCountries) return;
    const onDown = (e) => {
      if (countryRef.current && !countryRef.current.contains(e.target)) setShowCountries(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showCountries]);

  const handleSendOtp = async e => {
    e?.preventDefault();
    setError('');
    if (!isValidPhone) {
      const range = country.minDigits === country.maxDigits
        ? `${country.minDigits}-digit`
        : `${country.minDigits}–${country.maxDigits}-digit`;
      setError(lt(`Enter a valid ${range} mobile number`));
      return;
    }
    setLoading(true);
    try {
      const res = await api.sendOtp(fullPhone);
      const auth = unwrapAuth(res);
      if (!auth.success) throw new Error(auth.message || lt('Failed to send OTP'));
      setInfo(auth.message || lt('OTP sent to your WhatsApp number'));
      setOtp('');
      setStep(step === 'resetotp' || step === 'pin' ? 'resetotp' : 'otp');
      setResendIn(30);
    } catch (err) {
      setError(err?.data?.error?.message || err?.message || lt('Failed to send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const finishLogin = async (auth) => {
    if (auth.is_new_user || !auth.user?.name) {
      setPendingSession({ token: auth.access_token, user: auth.user });
      setStep('profile');
      setSigningIn(false);
      return;
    }
    setSigningIn(true);
    try {
      await login(auth.access_token, toAuthUser(auth.user));
      if (auth.is_paired) markPaired();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.message || lt('Sign in failed. Please try again.'));
      setSigningIn(false);
    }
  };

  const verifyOtpCode = async (code) => {
    setError('');
    const otpCode = (code || otp).replace(/\D/g, '');
    if (otpCode.length < OTP_LENGTH) { setError(lt('Enter the 4-digit OTP')); return; }
    setLoading(true);
    try {
      const forReset = step === 'resetotp';
      const res = await api.verifyOtp(fullPhone, otpCode.trim(), country.code, forReset ? { reset_pin: true } : {});
      const auth = unwrapAuth(res);
      if (!auth.success) throw new Error(auth.message || lt('Verification failed'));
      if (forReset) {
        setPreAuthToken(auth.pre_auth_token);
        setPin('');
        setStep('newpin');
        return;
      }
      if (auth.requires_2fa) {
        setPreAuthToken(auth.pre_auth_token);
        setPin('');
        setStep('pin');
        return;
      }
      await finishLogin(auth);
    } catch (err) {
      setError(err?.data?.error?.message || err?.message || lt('Verification failed'));
      setOtp('');
      otpRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const verify = async e => {
    e?.preventDefault();
    await verifyOtpCode();
  };

  const submitPin = async e => {
    e?.preventDefault();
    setError('');
    if (pin.replace(/\D/g, '').length < PIN_LENGTH) { setError(lt('Enter your 4-digit PIN')); return; }
    setLoading(true);
    setSigningIn(true);
    try {
      const isReset = step === 'newpin';
      const res = isReset ? await api.resetPin(pin.trim(), preAuthToken) : await api.verifyPin(pin.trim(), preAuthToken);
      const auth = unwrapAuth(res);
      if (!auth.success) throw new Error(auth.message || lt('Incorrect PIN'));
      await finishLogin(auth);
    } catch (err) {
      setSigningIn(false);
      setError(err?.message || lt('PIN verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const startPinReset = async () => {
    setError(''); setInfo('');
    setLoading(true);
    try {
      const res = await api.sendOtp(fullPhone);
      const auth = unwrapAuth(res);
      if (!auth.success) throw new Error(auth.message || lt('Failed to send OTP'));
      setInfo(lt('We sent a fresh OTP to verify it\u2019s you before resetting the PIN.'));
      setOtp('');
      setStep('resetotp');
      setResendIn(30);
    } catch (err) {
      setError(err?.message || lt('Failed to send OTP'));
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async e => {
    e?.preventDefault();
    setError('');
    if (profile.name.trim().length < 2) { setError(lt('Please enter your full name')); return; }
    if (!isValidEmail(profile.email)) { setError(lt('Please enter a valid email address')); return; }
    if (!termsAccepted) { setError(lt('Please accept the Terms of Service')); return; }
    setLoading(true);
    setSigningIn(true);
    try {
      const res = await api.registerUser(
        { name: profile.name.trim(), email: profile.email.trim().toLowerCase(), language: profile.language || 'English' },
        pendingSession?.token,
      );
      const auth = unwrapAuth(res);
      if (!auth.success || !auth.access_token) throw new Error(auth.message || lt('Registration failed. Please retry.'));
      sessionStorage.setItem('td.postAuthPath', '/settings/tally-sync');
      await login(auth.access_token, toAuthUser(auth.user || { ...pendingSession?.user, name: profile.name.trim(), email: profile.email.trim() }));
      navigate('/settings/tally-sync', { replace: true });
    } catch (err) {
      setSigningIn(false);
      setError(err?.message || lt('Failed to save profile'));
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'h-12 w-full rounded-xl border border-line bg-cream px-4 text-[13px] text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-ink focus:bg-surface';

  return (
    <div className="relative min-h-screen bg-paper p-4 lg:p-6" data-testid="login-page">
      {signingIn && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-paper/90 backdrop-blur-sm">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-ink" />
          <p className="text-[14px] font-medium text-ink">{lt('Signing you in…')}</p>
          <p className="text-[12px] text-ink-soft">{lt('Loading your company and dashboard')}</p>
        </div>
      )}
      <div className="grid min-h-[calc(100vh-3rem)] grid-cols-1 gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Brand panel */}
        <section className="relative hidden flex-col justify-between overflow-hidden rounded-3xl bg-ink p-12 lg:flex">
          <div className="flex items-center justify-between">
            <p className="display text-[20px] font-bold text-white">{lt('TallyDekho')}</p>
             <span className="rounded-md bg-white/10 px-3 py-1 text-[11px] text-white/70">{lt('Web portal')}</span>
          </div>

          <div>
            <h1 className="display text-[36px] font-bold leading-[1.02] text-white">
               {lt('Every ledger,')}<br />{lt('one calm view.')}
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/55">
               {lt('Registers, stock, compliance and reports from Tally Prime — on a desktop surface built for accountants.')}
            </p>

            <div className="mt-9 space-y-3.5">
              {FEATURES.map(([Icon, text]) => (
                <div key={text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                    <Icon size={15} strokeWidth={1.75} className="text-white" />
                  </span>
                   <span className="text-[13px] text-white/65">{lt(text)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {STATS.map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-white/[0.07] px-4 py-4">
                <p className="display text-[30px] font-bold leading-none text-white tabular">{n}</p>
                 <p className="mt-2 text-[11px] leading-tight text-white/45">{lt(l)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Form panel */}
        <section className="flex items-center justify-center rounded-3xl border border-line bg-surface px-6 py-12 sm:px-12">
          {step === 'pin' || step === 'newpin' ? (
            <form onSubmit={submitPin} className="rise w-full max-w-[380px]">
              <p className="display mb-8 text-[20px] font-bold text-ink lg:hidden">{lt('TallyDekho')}</p>
               <h2 className="display text-[36px] font-bold leading-none text-ink">{step === 'newpin' ? lt('Set a new PIN') : lt('Enter your PIN')}</h2>
              <p className="mt-3 text-[13px] text-ink-soft">
                {step === 'newpin'
                   ? lt('Choose a new 4-digit security PIN for your account.')
                   : lt('This account is protected with a security PIN (same PIN as the mobile app).')}
              </p>
              <div className="mt-8 space-y-4">
                <label className="block">
                   <span className="mb-2 block text-[11px] font-medium text-ink-soft">{step === 'newpin' ? lt('New 4-digit PIN') : lt('Security PIN')}</span>
                  <input
                    data-testid="login-pin-input"
                    autoFocus
                    type="password"
                    inputMode="numeric"
                    maxLength={PIN_LENGTH}
                    value={pin}
                    onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)); setError(''); }}
                    placeholder="••••"
                    className={inputCls + ' text-center text-[18px] tracking-[0.5em] tabular'}
                  />
                </label>
                {error && <p data-testid="login-error" className="rounded-xl bg-neg-bg px-3.5 py-2.5 text-[13px] text-neg">{error}</p>}
                <button type="submit" data-testid="login-pin-submit" disabled={loading}
                  className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-ink text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-[#2E2E2B] active:scale-[0.99] disabled:opacity-40">
                   {loading ? lt('Verifying…') : <>{step === 'newpin' ? lt('Save PIN & sign in') : lt('Unlock')} <ArrowRight size={15} strokeWidth={1.75} className="transition-transform group-hover:translate-x-1" /></>}
                </button>
                {step === 'pin' && (
                  <button type="button" data-testid="login-forgot-pin" disabled={loading} onClick={startPinReset}
                    className="h-9 w-full rounded-md text-[12px] font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-40">
                     {lt('Forgot PIN? Reset with OTP')}
                  </button>
                )}
              </div>
            </form>
          ) : step === 'profile' ? (
            <form onSubmit={saveProfile} className="rise w-full max-w-[380px]">
              <p className="display mb-8 text-[20px] font-bold text-ink lg:hidden">{lt('TallyDekho')}</p>
               <h2 className="display text-[36px] font-bold leading-none text-ink">{lt('Get Started')}</h2>
               <p className="mt-3 text-[13px] text-ink-soft">{lt('Log in to access your profile and get started easily.')}</p>
              <div className="mt-8 space-y-4">
                <label className="block">
                   <span className="mb-2 block text-[11px] font-medium text-ink-soft">{lt('Full Name')}</span>
                  <input data-testid="register-name-input" autoFocus type="text" maxLength={80} value={profile.name}
                    onChange={e => { setProfile(p => ({ ...p, name: e.target.value })); setError(''); }}
                     placeholder={lt('Enter your full name')} className={inputCls} />
                </label>
                <label className="block">
                   <span className="mb-2 block text-[11px] font-medium text-ink-soft">{lt('Email Address')}</span>
                  <input data-testid="register-email-input" type="email" maxLength={120} value={profile.email}
                    onChange={e => { setProfile(p => ({ ...p, email: e.target.value.toLowerCase() })); setError(''); }}
                    placeholder={lt('yourname@example.com')} className={inputCls} />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[11px] font-medium text-ink-soft">{lt('Choose Language')}</span>
                  <select
                    data-testid="register-language"
                    value={profile.language}
                    onChange={e => setProfile(p => ({ ...p, language: e.target.value }))}
                    className={inputCls}
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang.code} value={lang.name}>{lang.native}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-start gap-2.5 text-[12px] text-ink-soft">
                  <input
                    data-testid="register-terms"
                    type="checkbox"
                    className="mt-0.5"
                    checked={termsAccepted}
                    onChange={e => { setTermsAccepted(e.target.checked); setError(''); }}
                  />
                  <span>{lt('I accept the Terms of Service and Privacy Policy.')}</span>
                </label>
                {error && <p data-testid="login-error" className="rounded-xl bg-neg-bg px-3.5 py-2.5 text-[13px] text-neg">{error}</p>}
                <button type="submit" data-testid="register-submit" disabled={loading || profile.name.trim().length < 2 || !isValidEmail(profile.email) || !termsAccepted}
                  className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-ink text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-[#2E2E2B] active:scale-[0.99] disabled:opacity-40">
                   {loading ? lt('Saving…') : <>{lt('Continue')} <ArrowRight size={15} strokeWidth={1.75} className="transition-transform group-hover:translate-x-1" /></>}
                </button>
              </div>
            </form>
          ) : step === 'mobile' ? (
            <form onSubmit={handleSendOtp} className="rise w-full max-w-[380px]">
              <p className="display mb-8 text-[20px] font-bold text-ink lg:hidden">{lt('TallyDekho')}</p>

               <h2 className="display text-[36px] font-bold leading-none text-ink">{lt('Sign in')}</h2>
               <p className="mt-3 text-[13px] text-ink-soft">{lt("We'll send a one-time password to your WhatsApp.")}</p>

              <div className="mt-8 space-y-4">
                <label className="block">
                   <span className="mb-2 block text-[11px] font-medium text-ink-soft">{lt('Mobile number')}</span>
                  <div className="flex gap-2">
                    <div className="relative" ref={countryRef}>
                      <button
                        type="button"
                        data-testid="login-country-button"
                        onClick={() => setShowCountries(v => !v)}
                        className="flex h-12 items-center gap-1.5 rounded-xl border border-line bg-cream px-3 text-[13px] text-ink tabular"
                      >
                        <span>{country.flag}</span>
                        <span className="text-ink-soft">{country.code}</span>
                        <ChevronDown size={14} strokeWidth={1.75} className="text-ink-faint" />
                      </button>
                      {showCountries && (
                        <div className="absolute left-0 top-[calc(100%+6px)] z-20 max-h-64 w-[260px] overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
                          {COUNTRIES.map(c => (
                            <button
                              type="button"
                              key={c.code + c.name}
                              data-testid={`login-country-${c.code.replace('+', '')}`}
                              onClick={() => {
                                setCountry(c);
                                setMobile('');
                                setShowCountries(false);
                                setError('');
                              }}
                              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-cream ${c.code === country.code && c.name === country.name ? 'bg-cream font-medium' : ''}`}
                            >
                              <span>{c.flag}</span>
                              <span className="flex-1 text-ink">{c.name}</span>
                              <span className="tabular text-ink-soft">{c.code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      data-testid="login-mobile-input"
                      autoFocus
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={country.maxDigits}
                      value={mobile}
                      onChange={e => { setMobile(e.target.value.replace(/\D/g, '').slice(0, country.maxDigits)); setError(''); }}
                      placeholder={country.placeholder}
                      className={inputCls + ' tabular'}
                    />
                  </div>
                </label>

                {error && <p data-testid="login-error" className="rounded-xl bg-neg-bg px-3.5 py-2.5 text-[13px] text-neg">{error}</p>}

                <button
                  type="submit"
                  data-testid="login-send-otp-button"
                  disabled={loading || !isValidPhone}
                  className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-ink text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-[#2E2E2B] active:scale-[0.99] disabled:opacity-40"
                >
                   {loading ? lt('Sending OTP…') : <>{lt('Send OTP')} <ArrowRight size={15} strokeWidth={1.75} className="transition-transform group-hover:translate-x-1" /></>}
                </button>

                <div className="flex items-center gap-2.5 rounded-xl bg-cream/60 px-3.5 py-3">
                  <MessageCircle size={15} strokeWidth={1.75} className="shrink-0 text-pos" />
                   <p className="text-[12px] leading-snug text-ink-soft">{lt('Same login as the TallyDekho mobile app — your OTP arrives on WhatsApp.')}</p>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={verify} className="rise w-full max-w-[380px]">
              <p className="display mb-8 text-[20px] font-bold text-ink lg:hidden">{lt('TallyDekho')}</p>

               <h2 className="display text-[36px] font-bold leading-none text-ink">{step === 'resetotp' ? lt('Verify identity') : lt('Enter OTP')}</h2>
              <p className="mt-3 text-[13px] text-ink-soft">
                 {lt('Sent to WhatsApp on')} <span className="font-medium text-ink tabular">{country.code} {cleanMobile}</span>
                <button
                  type="button"
                  data-testid="login-change-number-button"
                  onClick={() => { setStep('mobile'); setError(''); setInfo(''); }}
                  className="ml-2 inline-flex items-center gap-1 text-[12px] font-medium text-ink underline underline-offset-2 hover:opacity-70"
                >
                   <ArrowLeft size={11} strokeWidth={2} /> {lt('Change')}
                </button>
              </p>

              <div className="mt-8 space-y-4">
                <label className="block">
                   <span className="mb-2 block text-[11px] font-medium text-ink-soft">{lt('One-time password')}</span>
                  <input
                    ref={otpRef}
                    data-testid="login-otp-input"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={OTP_LENGTH}
                    value={otp}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH);
                      setOtp(val);
                      setError('');
                      if (val.length === OTP_LENGTH && !loading && !signingIn) verifyOtpCode(val);
                    }}
                    placeholder="••••"
                    className={inputCls + ' text-center text-[18px] tracking-[0.35em] tabular'}
                  />
                </label>

                {info && !error && <p data-testid="login-info" className="rounded-xl bg-pos-bg px-3.5 py-2.5 text-[13px] text-pos">{info}</p>}
                {error && <p data-testid="login-error" className="rounded-xl bg-neg-bg px-3.5 py-2.5 text-[13px] text-neg">{error}</p>}

                <button
                  type="submit"
                  data-testid="login-verify-button"
                  disabled={loading}
                  className="group flex h-12 w-full items-center justify-center gap-2.5 rounded-md bg-ink text-[13px] font-medium text-white transition-[background-color,transform] hover:bg-[#2E2E2B] active:scale-[0.99] disabled:opacity-40"
                >
                   {loading ? lt('Verifying…') : <>{lt('Verify & sign in')} <ArrowRight size={15} strokeWidth={1.75} className="transition-transform group-hover:translate-x-1" /></>}
                </button>

                <button
                  type="button"
                  data-testid="login-resend-button"
                  disabled={loading || resendIn > 0}
                  onClick={() => handleSendOtp()}
                  className="h-9 w-full rounded-md text-[12px] font-medium text-ink-soft transition-colors hover:text-ink disabled:opacity-40"
                >
                   {resendIn > 0 ? <>{lt('Resend OTP in')} {resendIn}s</> : lt('Resend OTP')}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
