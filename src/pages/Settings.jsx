import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Check, ChevronRight } from 'lucide-react';
import {
  Card, Panel, Button, DataTable, Pill, Toggle, SettingRow, Select, Input,
  Field, KV, Textarea, Empty, Skeleton, useLabelT,
} from '../components/kit';
import { useFmt } from './shared';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import api, { apiGet, API_ROOT } from '../services/api';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import VoucherConfigPanel from '../components/settings/VoucherConfigPanel';
import { registerWebPushToken, getPushPermissionStatus } from '../services/push';
import { clearOnboardingForReplay } from '../utils/onboardingNav';

function Section({ title, sub, children, actions, testid, translated = false }) {
  const lt = useLabelT();
  return (
    <div className="space-y-4" data-testid={testid}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{translated ? title : lt(title)}</h2>
          {sub && <p className="text-[13px] text-ink-soft mt-0.5">{translated ? sub : lt(sub)}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

async function rootRequest(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('authToken');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
  }
  return response.json();
}

function useRemoteConfig(path, defaults, options = {}) {
  const lt = useLabelT();
  const [value, setValue] = useState(defaults);
  const [state, setState] = useState({ loading: true, loaded: false, saving: false, error: '', message: '' });
  const load = useCallback(async () => {
    if (!path) {
      setState({ loading: false, loaded: false, saving: false, error: lt('Select a company to edit these settings.'), message: '' });
      return;
    }
    setState(s => ({ ...s, loading: true, error: '', message: '' }));
    try {
      const response = await apiGet(path);
      const data = options.select ? options.select(response) : response?.data;
      setValue(current => ({ ...current, ...(data || {}) }));
      setState({ loading: false, loaded: true, saving: false, error: '', message: '' });
    } catch (err) {
      setState({ loading: false, loaded: false, saving: false, error: err?.message || lt('Unable to load settings'), message: '' });
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const save = async (payload = value) => {
    if (!path) return;
    setState(s => ({ ...s, saving: true, error: '', message: '' }));
    try {
      const response = await rootRequest(options.method || 'PATCH', options.savePath || path, options.serialize ? options.serialize(payload) : payload);
      setState(s => ({ ...s, saving: false, message: response?.message || lt('Settings saved.') }));
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: err?.message || lt('Unable to save settings') }));
    }
  };
  return { value, setValue, save, retry: load, ...state };
}

function ConfigState({ config, children }) {
  const lt = useLabelT();
  if (config.loading) return <Card className="p-5"><Skeleton rows={5} /></Card>;
  if (config.error && !config.loaded) return <Card><Empty message="Could not load settings" hint={config.error} /><div className="-mt-8 flex justify-center pb-6"><Button onClick={config.retry}>{lt('Retry')}</Button></div></Card>;
  return (
    <>
      {children}
      {config.error && <div className="flex items-center gap-3"><p className="text-[13px] text-neg">{config.error}</p><Button onClick={config.retry}>{lt('Retry')}</Button></div>}
      {config.message && <p className="text-[13px] text-pos">{config.message}</p>}
    </>
  );
}

function SaveAction({ config, testid }) {
  const lt = useLabelT();
  return <Button variant="primary" data-testid={testid} disabled={config.loading || !config.loaded || config.saving} onClick={() => config.save()}>{config.saving ? lt('Saving…') : lt('Save changes')}</Button>;
}

/* ── Profile ──────────────────────────────────────────────────────────────── */
export function SettingsProfile() {
  const lt = useLabelT();
  const { user, showToast } = useAuth();
  const [form, setForm] = useState({ name: user?.name || '', email: user?.email || '', mobile: user?.mobile || user?.phone || '', language: user?.language || 'English' });
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });
  const [changeKind, setChangeKind] = useState(null); // 'phone' | 'email' | null
  const [changeStep, setChangeStep] = useState(1);
  const [changeVal, setChangeVal] = useState('');
  const [otp, setOtp] = useState('');
  const [verifiedOtp, setVerifiedOtp] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeErr, setChangeErr] = useState('');

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const response = await api.fetchMe();
      const profile = response?.data || {};
      setForm({
        name: profile.name || '', email: profile.email || '',
        mobile: profile.mobile || profile.phone || '', language: profile.language || 'English',
      });
      setState(s => ({ ...s, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err?.message || 'Unable to load profile' }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setState(s => ({ ...s, saving: true, error: '', message: '' }));
    try {
      const response = await api.updateMe({ name: form.name, email: form.email, language: form.language });
      setState(s => ({ ...s, saving: false, message: response?.message || lt('Profile updated') }));
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: err?.message || lt('Unable to save profile') }));
    }
  };

  const openChange = (kind) => {
    setChangeKind(kind);
    setChangeStep(1);
    setChangeVal('');
    setOtp('');
    setVerifiedOtp('');
    setChangeErr('');
  };

  const runChangeStep = async () => {
    setChangeBusy(true);
    setChangeErr('');
    try {
      if (changeKind === 'phone') {
        if (changeStep === 1) {
          await api.changePhone({ step: 1, currentPhone: form.mobile });
          setChangeStep(2);
        } else if (changeStep === 2) {
          if (otp.length < 4) throw new Error(lt('Enter the OTP sent to your current number'));
          setVerifiedOtp(otp);
          setOtp('');
          setChangeStep(3);
        } else if (changeStep === 3) {
          if (!changeVal.trim()) throw new Error(lt('Enter the new mobile number'));
          await api.changePhone({ step: 2, currentPhone: form.mobile, otp: verifiedOtp, newPhone: changeVal.trim() });
          setOtp('');
          setChangeStep(4);
        } else if (changeStep === 4) {
          if (otp.length < 4) throw new Error(lt('Enter the OTP sent to the new number'));
          await api.changePhone({ step: 3, otp });
          setForm(f => ({ ...f, mobile: changeVal.trim() }));
          showToast?.(lt('Mobile number updated'), 'success');
          setChangeKind(null);
        }
      } else if (changeKind === 'email') {
        if (changeStep === 1) {
          await api.changeEmail({ step: 1, currentEmail: form.email });
          setChangeStep(2);
        } else if (changeStep === 2) {
          if (!changeVal.trim()) throw new Error(lt('Enter the new email'));
          await api.changeEmail({ step: 1, currentEmail: changeVal.trim() });
          setChangeStep(3);
        } else if (changeStep === 3) {
          if (otp.length < 4) throw new Error(lt('Enter the OTP'));
          await api.changeEmail({ step: 2, otp, newEmail: changeVal.trim() });
          setForm(f => ({ ...f, email: changeVal.trim() }));
          showToast?.(lt('Email updated'), 'success');
          setChangeKind(null);
        }
      }
    } catch (err) {
      setChangeErr(err?.message || lt('Unable to continue'));
    } finally {
      setChangeBusy(false);
    }
  };

  const changeTitle = changeKind === 'phone' ? lt('Change mobile') : lt('Change email');
  const changeHint = changeKind === 'phone'
    ? (changeStep === 1 ? lt('We will send an OTP to your current WhatsApp number.')
      : changeStep === 2 ? lt('Enter the OTP sent to your current number.')
      : changeStep === 3 ? lt('Enter the new mobile number.')
      : lt('Enter the OTP sent to the new number.'))
    : (changeStep === 1 ? lt('We will verify your current email.')
      : changeStep === 2 ? lt('Enter the new email address.')
      : lt('Enter the OTP sent to the new email.'));

  return (
    <Section title="Profile" sub="Your personal details on this workspace" testid="settings-profile"
       actions={<Button variant="primary" data-testid="profile-save" disabled={state.loading || state.saving} onClick={save}>{state.message ? <><Check size={13} /> {lt('Saved')}</> : state.saving ? lt('Saving…') : lt('Save changes')}</Button>}>
      {state.loading ? <Card className="p-5"><Skeleton rows={4} /></Card> : state.error && !form.name && !form.mobile ? (
         <Card><Empty message="Could not load profile" hint={state.error} /><div className="-mt-8 flex justify-center pb-6"><Button onClick={load}>{lt('Retry')}</Button></div></Card>
      ) : (
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name"><Input data-testid="profile-name" value={form.name} onChange={e => { setForm({ ...form, name: e.target.value }); setState(s => ({ ...s, message: '' })); }} /></Field>
          <Field label="Email">
            <div className="flex gap-2">
              <Input data-testid="profile-email" className="flex-1" value={form.email} onChange={e => { setForm({ ...form, email: e.target.value }); setState(s => ({ ...s, message: '' })); }} />
              <Button data-testid="profile-change-email" onClick={() => openChange('email')}>{lt('Verify change')}</Button>
            </div>
          </Field>
          <Field label="Mobile">
            <div className="flex gap-2">
              <Input data-testid="profile-mobile" className="flex-1" value={form.mobile} readOnly />
              <Button data-testid="profile-change-phone" onClick={() => openChange('phone')}>{lt('Change')}</Button>
            </div>
          </Field>
           <Field label="Language"><Select data-testid="profile-role" value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}>{['English', 'Hindi', 'Bengali', 'Marathi', 'Gujarati', 'Tamil', 'Telugu', 'Kannada'].map(r => <option key={r} value={r}>{lt(r)}</option>)}</Select></Field>
        </Card>
      )}
       {state.error && <div className="flex items-center gap-3"><p className="text-[13px] text-neg">{state.error}</p><Button onClick={load}>{lt('Retry')}</Button></div>}
      {state.message && <p className="text-[13px] text-pos">{state.message}</p>}

      {changeKind && (
        <Card className="p-5 space-y-3" data-testid="profile-change-contact">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">{changeTitle}</p>
              <p className="text-[13px] text-ink-soft mt-0.5">{changeHint}</p>
            </div>
            <Button variant="ghost" onClick={() => setChangeKind(null)}>{lt('Cancel')}</Button>
          </div>
          {(changeStep === 3 && changeKind === 'phone') || (changeStep === 2 && changeKind === 'email') ? (
            <Field label={changeKind === 'phone' ? 'New mobile' : 'New email'}>
              <Input data-testid="profile-change-value" value={changeVal} onChange={e => setChangeVal(e.target.value)} placeholder={changeKind === 'phone' ? '+91…' : 'name@company.com'} />
            </Field>
          ) : null}
          {(changeStep === 2 || changeStep === 4 || (changeKind === 'email' && changeStep === 3)) ? (
            <Field label="OTP">
              <Input data-testid="profile-change-otp" value={otp} onChange={e => setOtp(e.target.value)} placeholder="••••" />
            </Field>
          ) : null}
          {changeErr && <p className="text-[13px] text-neg">{changeErr}</p>}
          <Button variant="primary" data-testid="profile-change-continue" disabled={changeBusy} onClick={runChangeStep}>
            {changeBusy ? lt('Please wait…') : (changeStep === 1 ? lt('Send OTP') : lt('Continue'))}
          </Button>
        </Card>
      )}
    </Section>
  );
}

/* ── Company (logo upload) ────────────────────────────────────────────────── */
export function SettingsCompany() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const [logo, setLogo] = useState(null);
  const [capabilities, setCapabilities] = useState(null);
  const [form, setForm] = useState({
    name: selectedCompany?.name || '', gstin: selectedCompany?.gstin || '', state: selectedCompany?.state || '',
    address: selectedCompany?.address || '', phone: selectedCompany?.phone || '', email: selectedCompany?.email || '',
  });
  const [state, setState] = useState({ loading: true, saving: false, uploading: false, error: '', message: '' });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const guid = selectedCompany?.guid;
    if (!guid) {
      setState(s => ({ ...s, loading: false, error: 'Select a company to edit its profile.' }));
      return;
    }
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const [profileResponse, logoResponse, capsRes] = await Promise.all([
        apiGet(`/api/company/profile?companyGuid=${encodeURIComponent(guid)}`),
        api.fetchCompanyLogo(guid),
        api.fetchCompanyCapabilities(guid).catch(() => null),
      ]);
      const profile = profileResponse?.data || {};
      setForm({
        name: profile.formal_name || profile.name || '', gstin: profile.gstin || '',
        state: profile.state || '', address: profile.address || '',
        phone: profile.phone || profile.mobile || '', email: profile.email || '',
      });
      setLogo(logoResponse?.data?.logo_url || null);
      setCapabilities(capsRes?.data || capsRes || null);
      setState(s => ({ ...s, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err?.message || 'Unable to load company profile' }));
    }
  }, [selectedCompany?.guid]);
  useEffect(() => { load(); }, [load]);

  const pick = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setState(s => ({ ...s, error: lt('Please select an image file.'), message: '' }));
      return;
    }
    if (f.size > 500 * 1024) {
      setState(s => ({ ...s, error: lt('Logo too large. Maximum size is 500 KB.'), message: '' }));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setState(s => ({ ...s, error: lt('Could not read the selected image.') }));
    reader.onload = async () => {
      const logoString = String(reader.result || '');
      setLogo(logoString);
      setState(s => ({ ...s, uploading: true, error: '', message: '' }));
      try {
        await api.uploadCompanyLogo(selectedCompany.guid, logoString);
        setState(s => ({ ...s, uploading: false, message: lt('Logo uploaded successfully.') }));
      } catch (err) {
        setState(s => ({ ...s, uploading: false, error: err?.message || lt('Unable to upload logo') }));
      }
    };
    reader.readAsDataURL(f);
  };
  const save = async () => {
    if (!selectedCompany?.guid) return;
    setState(s => ({ ...s, saving: true, error: '', message: '' }));
    try {
      await api.updateCompanyProfile(selectedCompany.guid, {
        formal_name: form.name, gstin: form.gstin, state: form.state,
        address: form.address,
      });
      setState(s => ({ ...s, saving: false, message: lt('Company profile updated.') }));
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: err?.message || lt('Unable to save company profile') }));
    }
  };

  const capEntries = capabilities && typeof capabilities === 'object'
    ? Object.entries(capabilities).filter(([, v]) => typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number')
    : [];

  return (
    <Section title="Company" sub="Details printed on invoices and reports" testid="settings-company"
       actions={<Button variant="primary" data-testid="company-save" disabled={state.loading || state.saving} onClick={save}>{state.saving ? lt('Saving…') : state.message ? <><Check size={13} strokeWidth={1.5} /> {lt('Saved')}</> : lt('Save changes')}</Button>}>
      {state.loading ? <Card className="p-5"><Skeleton rows={6} /></Card> : state.error && !form.name ? (
         <Card><Empty message="Could not load company" hint={state.error} /><div className="-mt-8 flex justify-center pb-6"><Button onClick={load}>{lt('Retry')}</Button></div></Card>
      ) : <>
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="h-20 w-20 rounded-xl border border-line bg-cream flex items-center justify-center overflow-hidden">
             {logo ? <img src={logo} alt={lt('Company logo')} className="h-full w-full object-contain" /> : <span className="text-2xl font-bold text-ink-faint">{form.name?.[0] || 'C'}</span>}
          </div>
          <div>
             <p className="text-[13px] font-medium text-ink">{lt('Company logo')}</p>
             <p className="text-[11px] text-ink-faint mt-0.5">{lt('PNG or SVG, at least 256×256. Used on printed documents.')}</p>
            <div className="mt-2.5 flex gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pick} data-testid="logo-file-input" />
               <Button data-testid="logo-upload-button" disabled={state.uploading} onClick={() => fileRef.current?.click()}><Upload size={13} /> {state.uploading ? lt('Uploading…') : lt('Upload logo')}</Button>
            </div>
          </div>
        </div>
      </Card>
      <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Company name"><Input data-testid="company-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="GSTIN"><Input data-testid="company-gstin" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></Field>
        <Field label="State"><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></Field>
        <Field label="Phone (synced from Tally)"><Input value={form.phone} readOnly /></Field>
        <Field label="Email (synced from Tally)"><Input value={form.email} readOnly /></Field>
        <Field label="Address" className="sm:col-span-2"><Textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field>
      </Card>
      {capEntries.length > 0 && (
        <Card className="p-5" data-testid="company-capabilities">
          <p className="text-sm font-bold text-ink mb-1">{lt('Company capabilities')}</p>
          <p className="text-[12px] text-ink-soft mb-3">{lt('From GET /api/company/capabilities — same as mobile.')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {capEntries.map(([key, value]) => (
              <div key={key} className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                <span className="text-[13px] text-ink-soft">{lt(key)}</span>
                <span className="text-[13px] font-semibold text-ink">{typeof value === 'boolean' ? (value ? lt('Yes') : lt('No')) : String(value)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      </>}
       {state.error && <div className="flex items-center gap-3"><p className="text-[13px] text-neg">{state.error}</p><Button onClick={load}>{lt('Retry')}</Button></div>}
      {state.message && <p className="text-[13px] text-pos">{state.message}</p>}
    </Section>
  );
}

/* ── Tally sync ───────────────────────────────────────────────────────────── */
export function SettingsTallySync() {
  const lt = useLabelT();
  const { isPaired, isDesktopOnline, markPaired, markUnpaired, loadCompanies, unpairFromTally } = useAuth();
  const [code, setCode] = useState('');
  const [device, setDevice] = useState(null);
  const [paired, setPaired] = useState(isPaired);
  const [online, setOnline] = useState(!!isDesktopOnline);
  const [state, setState] = useState({ loading: true, saving: false, error: '', message: '' });
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const response = await api.fetchTallySyncStatus();
      const data = response?.data ?? response;
      const nextPaired = !!(data?.is_paired ?? data?.isPaired);
      setDevice(data?.device || null);
      setPaired(nextPaired);
      setOnline(!!data?.desktop_online);
      if (nextPaired) markPaired();
      else markUnpaired();
      setState(s => ({ ...s, loading: false }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err?.message || 'Unable to load pairing status' }));
    }
  }, [markPaired, markUnpaired]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPaired(isPaired); setOnline(!!isDesktopOnline); }, [isPaired, isDesktopOnline]);
  const pair = async () => {
    if (!code.trim()) return setState(s => ({ ...s, error: lt('Enter the pairing code shown by the desktop agent.'), message: '' }));
    setState(s => ({ ...s, saving: true, error: '', message: '' }));
    try {
      const response = await api.pairWithTally(code.trim());
      markPaired();
      setPaired(true);
      setCode('');
      await loadCompanies();
      setState(s => ({ ...s, saving: false, message: response?.data?.message || lt('Paired successfully.') }));
      await load();
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: err?.message || lt('Pairing failed') }));
    }
  };
  const unpair = async () => {
    setState(s => ({ ...s, saving: true, error: '', message: '' }));
    try {
      await unpairFromTally();
      setPaired(false);
      setOnline(false);
      setDevice(null);
      setState(s => ({ ...s, saving: false, message: lt('Unpaired. Enter a new code to pair again.') }));
    } catch (err) {
      setState(s => ({ ...s, saving: false, error: err?.message || lt('Unpair failed') }));
    }
  };
  const lastSeen = device?.last_seen
    ? new Date(Number(device.last_seen) * 1000).toLocaleString()
    : null;
  return (
    <Section
      title="Tally Sync"
      sub="Pair this portal with the Tally desktop agent"
      testid="settings-tally-sync"
      actions={
        <Button variant="danger" data-testid="unpair-button" disabled={state.saving} onClick={unpair}>
          {state.saving ? lt('Working…') : lt('Unpair')}
        </Button>
      }
    >
      {state.loading ? <Card className="p-5"><Skeleton rows={3} /></Card> : (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className={`h-2 w-2 rounded-[3px] ${paired && online ? 'bg-pos animate-pulse' : paired ? 'bg-warn' : 'bg-warn'}`} />
           <p className="text-[13px] font-medium text-ink">{paired ? <>{lt('Paired with')} {device?.name || lt('Tally Prime — Desktop')}</> : lt('Not paired')}</p>
           <Pill tone={paired && online ? 'pos' : paired ? 'warn' : 'warn'} className="ml-auto">
             {paired ? (online ? lt('Desktop online') : lt('Paired · desktop offline')) : lt('Pending')}
           </Pill>
        </div>
        {lastSeen && paired && <p className="mt-2 text-[11px] text-ink-faint">{lt('Last seen')} {lastSeen}</p>}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Pairing code from desktop agent">
            <Input data-testid="pairing-code-input" value={code} onChange={e => setCode(e.target.value)} placeholder={lt('e.g. 482910')} />
          </Field>
           <Button variant="primary" data-testid="pair-button" disabled={state.saving} onClick={pair}>{state.saving ? lt('Pairing…') : lt('Pair device')}</Button>
        </div>
        <div className="mt-4">
          <Button variant="danger" data-testid="unpair-button-card" disabled={state.saving} onClick={unpair}>
            {state.saving ? lt('Working…') : lt('Unpair Tally')}
          </Button>
        </div>
         {state.error && <div className="mt-3 flex items-center gap-3"><p className="text-[11px] text-neg">{state.error}</p><Button onClick={load}>{lt('Retry')}</Button></div>}
        {state.message && <p className="mt-3 text-[11px] text-pos">{state.message}</p>}
      </Card>
      )}
    </Section>
  );
}

/* ── Bank feeds ───────────────────────────────────────────────────────────── */
export function SettingsBankFeeds() {
  const lt = useLabelT();
  const { selectedCompany, showToast } = useAuth();
  const [state, setState] = useState({ loading: true, error: '', rows: [] });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ bankName: '', accountNumber: '', ifsc: '' });
  const [createErr, setCreateErr] = useState('');
  const [saving, setSaving] = useState(false);
  const genRef = useRef(0); // stale-response guard across company switches
  const load = useCallback(async () => {
    const gen = ++genRef.current;
    if (!selectedCompany?.guid) { setState({ loading: false, error: 'Select a company first.', rows: [] }); return; }
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const res = await api.fetchBankLedgers(selectedCompany.guid, 'bank');
      if (gen !== genRef.current) return;
      const rows = (res?.data || []).map((r, i) => ({ ...r, id: r.guid || r.name || i }));
      setState({ loading: false, error: '', rows });
    } catch (e) {
      if (gen !== genRef.current) return;
      setState({ loading: false, error: e.message || 'Failed to load bank accounts', rows: [] });
    }
  }, [selectedCompany?.guid]);
  useEffect(() => { load(); }, [load]);
  const createBank = async () => {
    if (!selectedCompany?.guid) return;
    if (!form.bankName.trim()) { setCreateErr(lt('Bank name is required')); return; }
    setSaving(true); setCreateErr('');
    try {
      await api.createBankLedgerInTally({
        companyGuid: selectedCompany.guid,
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim() || undefined,
        ifsc: form.ifsc.trim() || undefined,
      });
      showToast?.(lt('Bank ledger queued to Tally'), 'success');
      setCreating(false);
      setForm({ bankName: '', accountNumber: '', ifsc: '' });
      load();
    } catch (e) {
      setCreateErr(e?.message || lt('Unable to create bank ledger'));
    } finally { setSaving(false); }
  };
  const { money } = useFmt();
  return (
    <Section title="Bank Accounts" sub="Bank ledgers in this company's books" testid="settings-bank-feeds"
       actions={<Button data-testid="add-bank-account" variant="primary" onClick={() => setCreating(true)}>{lt('Add bank account')}</Button>}>
      {creating && (
        <Card className="p-5 space-y-3 mb-4" data-testid="create-bank-form">
          <p className="text-sm font-bold text-ink">{lt('Create bank ledger')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Bank name"><Input data-testid="bank-name" value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} /></Field>
            <Field label="Account number"><Input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} /></Field>
            <Field label="IFSC"><Input value={form.ifsc} onChange={e => setForm({ ...form, ifsc: e.target.value })} /></Field>
          </div>
          {createErr && <p className="text-[13px] text-neg">{createErr}</p>}
          <div className="flex gap-2">
            <Button variant="primary" disabled={saving} onClick={createBank}>{saving ? lt('Saving…') : lt('Create in Tally')}</Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>{lt('Cancel')}</Button>
          </div>
        </Card>
      )}
      <Card>
        <div data-testid="bank-feeds-table">
          {state.loading ? <Skeleton rows={4} /> : state.error ? (
             <Empty message={state.error} hint={<Button onClick={load}>{lt('Retry')}</Button>} />
          ) : !state.rows.length ? (
            <Empty message="No bank ledgers yet" hint={lt('Use Add bank account — creates via /tally/master/bank like mobile.')} />
          ) : (
            <DataTable testid="bank-ledgers-table" rows={state.rows} columns={[
              { key: 'name', label: 'Bank ledger', render: r => <span className="font-medium">{r.name}</span> },
              { key: 'parent', label: 'Under group' },
              { key: 'balance_type', label: 'Dr/Cr', render: r => <Pill tone={r.balance_type === 'Dr' ? 'pos' : 'warn'}>{r.balance_type || '—'}</Pill> },
              { key: 'closing_balance', label: 'Closing balance', align: 'right', render: r => money(Math.abs(Number(r.closing_balance) || 0)) },
            ]} />
          )}
        </div>
         <p className="mt-3 text-[11px] text-ink-faint">{lt('Account details (account number, IFSC, branch) are set when creating the ledger. Edits to existing bank ledgers are made in Tally Prime, same as the mobile app.')}</p>
      </Card>
    </Section>
  );
}

/* ── Security ─────────────────────────────────────────────────────────────── */
export function SettingsSecurity() {
  const lt = useLabelT();
  const navigate = useNavigate();
  const { logout } = useAuth();
  return (
    <Section title="Security" sub="Session controls — manage PIN and biometric unlock from the mobile app" testid="settings-security">
      <Card>
        <SettingRow title="Two-factor authentication / PIN" desc="Set or change your 4-digit PIN in the TallyDekho mobile app. Web sign-in always uses OTP; when 2FA is enabled on your account, you will be asked for your PIN after OTP.">
          <Pill tone="neutral">{lt('Mobile app only')}</Pill>
        </SettingRow>
        <SettingRow title="Biometric unlock" desc="Enable Face ID or fingerprint in the mobile app Settings → Security.">
          <Pill tone="neutral">{lt('Mobile app only')}</Pill>
        </SettingRow>
        <SettingRow title="Sign out" desc="End this browser session.">
          <Button data-testid="security-sign-out" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>{lt('Sign out')}</Button>
        </SettingRow>
      </Card>
    </Section>
  );
}

/* ── Preferences / currency / language ────────────────────────────────────── */
function useLiveUserSettings() {
  const lt = useLabelT();
  const context = useSettings();
  const [settings, setSettings] = useState(context.settings);
  const [state, setState] = useState({ loading: true, loaded: false, error: '', message: '' });
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const response = await api.getUserSettings();
      setSettings(current => ({ ...current, ...(response?.data || {}) }));
      setState(s => ({ ...s, loading: false, loaded: true }));
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err?.message || lt('Unable to load settings') }));
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const updateSettings = async partial => {
    const previous = settings;
    setSettings(current => ({ ...current, ...partial }));
    setState(s => ({ ...s, error: '', message: '' }));
    try {
      await api.updateUserSettings(partial);
      const updated = { ...previous, ...partial };
      localStorage.setItem('userSettings', JSON.stringify(updated));
      setState(s => ({ ...s, message: lt('Settings saved.') }));
    } catch (err) {
      setSettings(previous);
      setState(s => ({ ...s, error: err?.message || lt('Unable to save settings') }));
    }
  };
  return { settings, updateSettings, ...state, retry: load };
}

function SettingsState({ live, children }) {
  const lt = useLabelT();
  if (live.loading) return <Card className="p-5"><Skeleton rows={4} /></Card>;
  if (live.error && !live.loaded) {
    return <Card><Empty message="Could not load settings" hint={live.error} /><div className="-mt-8 flex justify-center pb-6"><Button onClick={live.retry}>{lt('Retry')}</Button></div></Card>;
  }
  return <>{children}{live.error && <div className="mt-3 flex items-center gap-3"><p className="text-[13px] text-neg">{live.error}</p><Button onClick={live.retry}>{lt('Retry')}</Button></div>}{live.message && <p className="mt-3 text-[13px] text-pos">{live.message}</p>}</>;
}

export function SettingsPreferences() {
  const lt = useLabelT();
  const live = useLiveUserSettings();
  const { settings, updateSettings } = live;
  return (
    <Section title="App Preferences" sub="How data is displayed across the portal" testid="settings-preferences">
      <SettingsState live={live}>
      <Card>
        <SettingRow title="Date format">
          <Select className="w-48" data-testid="date-format" value={settings.date_format} onChange={e => updateSettings({ date_format: e.target.value })}>
            {['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map(o => <option key={o}>{o}</option>)}
          </Select>
        </SettingRow>
        <SettingRow title="Number format" desc="Indian uses lakh / crore grouping">
          <Select className="w-48" data-testid="number-format" value={settings.number_format} onChange={e => updateSettings({ number_format: e.target.value })}>
             {['Indian', 'International'].map(o => <option key={o} value={o}>{lt(o)}</option>)}
          </Select>
        </SettingRow>
        <SettingRow title="Decimal places">
          <Select className="w-24" data-testid="decimals" value={settings.decimal_places} onChange={e => updateSettings({ decimal_places: Number(e.target.value) })}>
            {[0, 1, 2, 3].map(o => <option key={o}>{o}</option>)}
          </Select>
        </SettingRow>
        <SettingRow title="KPI auto-scroll" desc="Automatically rotate dashboard KPI cards">
          <Toggle checked={!!settings.kpi_autoscroll} onChange={v => updateSettings({ kpi_autoscroll: v })} testid="table-density" />
        </SettingRow>
      </Card>
      </SettingsState>
    </Section>
  );
}

export function SettingsCurrency() {
  const lt = useLabelT();
  const live = useLiveUserSettings();
  const { settings, updateSettings } = live;
  const { money } = useFmt();
  const list = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'SGD', 'AUD', 'CAD', 'NPR', 'LKR', 'BDT'];
  return (
    <Section title="Currency" sub="Base currency used for all amounts" testid="settings-currency">
      <SettingsState live={live}>
      <Card className="p-5">
        <Field label="Base currency" className="max-w-xs">
          <Select data-testid="currency-select" value={settings.currency} onChange={e => updateSettings({ currency: e.target.value })}>
            {list.map(c => <option key={c}>{c}</option>)}
          </Select>
        </Field>
         <p className="mt-4 text-[13px] text-ink-soft">{lt('Preview:')} <span className="font-semibold text-ink tabular">{money(1234567.89)}</span></p>
      </Card>
      </SettingsState>
    </Section>
  );
}

export function SettingsLanguage() {
  const lt = useLabelT();
  const live = useLiveUserSettings();
  // Language writes go through SettingsContext (single write path: persists +
  // keeps i18n and formatting in sync for the whole session).
  const { settings, updateSettings } = useSettings();
  const { t } = useTranslation();
  // Same 11 languages as the mobile app; selection persists by English name and
  // is matched against legacy stored native labels too.
  const isSelected = l => settings.language === l.name || settings.language === l.native;
  return (
    <Section title={t('languageRegion.language', 'Language')} sub={t('languageRegion.appLanguage', 'Interface language')} testid="settings-language" translated>
      <SettingsState live={live}>
      <Card className="p-2">
        {LANGUAGES.map(l => (
          <button key={l.code} data-testid={`lang-${l.name}`} onClick={() => updateSettings({ language: l.name })}
            className={`w-full flex items-center justify-between px-3 h-11 rounded-xl text-[13px] transition-colors ${isSelected(l) ? 'bg-ink text-white font-medium' : 'text-ink hover:bg-cream'}`}>
            <span>{l.native}{l.native !== l.name && <span className={`ml-2 text-[11px] ${isSelected(l) ? 'text-white/60' : 'text-ink-faint'}`}>{l.name}</span>}</span>
            {isSelected(l) && <Check size={13} className="text-white" />}
          </button>
        ))}
      </Card>
       <p className="text-[11px] text-ink-faint">{lt('Translations are shared with the TallyDekho mobile app. Screens are being translated progressively; untranslated text appears in English.')}</p>
      </SettingsState>
    </Section>
  );
}

/* ── Alerts ───────────────────────────────────────────────────────────────── */
export function SettingsNotificationChannels() {
  const lt = useLabelT();
  const config = useRemoteConfig('/api/notification-settings', { push: true, email: true, sms: false, whatsapp: true, digest: 'Daily' });
  const s = config.value;
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [pushPerm, setPushPerm] = useState('default');
  useEffect(() => { getPushPermissionStatus().then(setPushPerm).catch(() => setPushPerm('unsupported')); }, []);
  const enableBrowserPush = async () => {
    setPushBusy(true);
    setPushMsg('');
    try {
      await registerWebPushToken();
      setPushMsg(lt('Browser push enabled'));
      setPushPerm('granted');
    } catch (err) {
      setPushMsg(err?.message || lt('Unable to enable browser push'));
    } finally {
      setPushBusy(false);
    }
  };
  return (
    <Section title="Notification Channels" sub="Where alerts are delivered" testid="settings-notification-channels" actions={<SaveAction config={config} testid="notification-save" />}>
      <ConfigState config={config}>
      <Card>
        <SettingRow title="In-app / push"><Toggle checked={!!s.push} onChange={v => config.setValue({ ...s, push: v })} testid="toggle-push" /></SettingRow>
        <SettingRow title="Browser push (FCM)" desc={pushPerm === 'granted' ? lt('Permission granted') : pushPerm === 'denied' ? lt('Blocked in browser settings') : lt('Enable desktop notifications')}>
          <Button disabled={pushBusy || pushPerm === 'denied'} onClick={enableBrowserPush} data-testid="enable-browser-push">
            {pushBusy ? lt('Enabling…') : lt('Enable browser push')}
          </Button>
        </SettingRow>
        {pushMsg && <p className="px-5 pb-3 text-[13px] text-ink-soft">{pushMsg}</p>}
        <SettingRow title="Email"><Toggle checked={!!s.email} onChange={v => config.setValue({ ...s, email: v })} testid="toggle-email" /></SettingRow>
        <SettingRow title="SMS"><Toggle checked={!!s.sms} onChange={v => config.setValue({ ...s, sms: v })} testid="toggle-sms" /></SettingRow>
        <SettingRow title="WhatsApp"><Toggle checked={!!s.whatsapp} onChange={v => config.setValue({ ...s, whatsapp: v })} testid="toggle-whatsapp" /></SettingRow>
        <SettingRow title="Summary digest">
          <Select className="w-40" data-testid="digest-select" value={s.digest} onChange={e => config.setValue({ ...s, digest: e.target.value })}>
             {['Off', 'Daily', 'Weekly'].map(o => <option key={o} value={o}>{lt(o)}</option>)}
          </Select>
        </SettingRow>
      </Card>
      </ConfigState>
    </Section>
  );
}

export function SettingsPaymentReminders() {
  const lt = useLabelT();
  const config = useRemoteConfig('/api/alert-settings', {
    payment_reminders: {
      threshold: 0,
      reminders: [{ enabled: false, daysBefore: 3, time: '09:00 AM', channels: { whatsapp: true, email: false, sms: false }, exceptions: [] }],
    },
  });
  const payment = config.value.payment_reminders || {};
  const reminder = payment.reminders?.[0] || { enabled: false, daysBefore: 3, time: '09:00 AM', channels: {} };
  const update = patch => config.setValue({
    ...config.value,
    payment_reminders: { ...payment, reminders: [{ ...reminder, ...patch }, ...(payment.reminders || []).slice(1)] },
  });
  const updateChannel = channel => update({ channels: { whatsapp: channel === 'WhatsApp', email: channel === 'Email', sms: channel === 'SMS' } });
  const channel = reminder.channels?.email ? 'Email' : reminder.channels?.sms ? 'SMS' : 'WhatsApp';
  return (
    <Section title="Payment Reminders" sub="Automatic follow-ups on overdue receivables" testid="settings-payment-reminders" actions={<SaveAction config={config} testid="payment-reminders-save" />}>
      <ConfigState config={config}>
      <Card>
        <SettingRow title="Enable reminders"><Toggle checked={!!reminder.enabled} onChange={v => update({ enabled: v })} testid="toggle-reminders" /></SettingRow>
        <SettingRow title="Reminder lead time (days before due)"><Input type="number" className="w-24" data-testid="first-reminder" value={reminder.daysBefore} onChange={e => update({ daysBefore: Number(e.target.value) })} /></SettingRow>
        <SettingRow title="Send time"><Input className="w-32" value={reminder.time || ''} onChange={e => update({ time: e.target.value })} placeholder={lt('09:00 AM')} /></SettingRow>
        <SettingRow title="Send via">
           <Select className="w-40" value={channel} onChange={e => updateChannel(e.target.value)}>{['Email', 'SMS', 'WhatsApp'].map(o => <option key={o} value={o}>{lt(o)}</option>)}</Select>
        </SettingRow>
        <SettingRow title="Minimum outstanding" desc="Skip smaller balances"><Input type="number" className="w-32" value={payment.threshold ?? 0} onChange={e => config.setValue({ ...config.value, payment_reminders: { ...payment, threshold: Number(e.target.value) } })} /></SettingRow>
      </Card>
      </ConfigState>
    </Section>
  );
}

export function SettingsComplianceReminders() {
  const lt = useLabelT();
  const config = useRemoteConfig('/api/alert-settings', {
    compliance: { gstr1FilingDays: 3, gstr3bFilingDays: 3 },
  });
  const s = config.value.compliance || {};
  const update = patch => config.setValue({ ...config.value, compliance: { ...s, ...patch } });
  return (
    <Section title="Compliance Reminders" sub="Return filing and tax due-date alerts" testid="settings-compliance-reminders" actions={<SaveAction config={config} testid="compliance-reminders-save" />}>
      <ConfigState config={config}>
      <Card>
         <SettingRow title="GST return reminders" desc="The scheduler uses the GSTR-1 and GSTR-3B lead times below."><Pill tone="pos">{lt('Enabled')}</Pill></SettingRow>
        <SettingRow title="GSTR-1 lead time (days)"><Input type="number" className="w-24" data-testid="lead-time" value={s.gstr1FilingDays ?? 3} onChange={e => update({ gstr1FilingDays: Number(e.target.value) })} /></SettingRow>
        <SettingRow title="GSTR-3B lead time (days)"><Input type="number" className="w-24" value={s.gstr3bFilingDays ?? 3} onChange={e => update({ gstr3bFilingDays: Number(e.target.value) })} /></SettingRow>
         <SettingRow title="TDS / TCS and advance tax reminders" desc="No scheduler contract is available for these reminder types."><Pill tone="neutral">{lt('Not yet available on web')}</Pill></SettingRow>
      </Card>
      <Panel title="Upcoming due dates">
        <div data-testid="compliance-due-table"><Empty message="Upcoming due dates unavailable" hint="The backend does not expose a compliance due-date calendar." /></div>
      </Panel>
      </ConfigState>
    </Section>
  );
}

export function SettingsStockAlerts() {
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const config = useRemoteConfig(guid ? `/api/inventory/settings?companyGuid=${encodeURIComponent(guid)}` : '', {}, {
    method: 'POST',
    select: response => response?.data?.settings || {},
    savePath: guid ? `/api/inventory/settings?companyGuid=${encodeURIComponent(guid)}` : '',
  });
  const s = config.value;
  const updateAlert = (key, patch) => config.setValue({ ...s, [key]: { ...(s[key] || {}), ...patch } });
  return (
    <Section title="Stock Alerts" sub="Inventory warnings and thresholds" testid="settings-stock-alerts" actions={<SaveAction config={config} testid="stock-alerts-save" />}>
      <ConfigState config={config}>
      <Card>
        <SettingRow title="Low stock in-app alerts"><Toggle checked={!!s.low_stock_alerts?.inApp} onChange={v => updateAlert('low_stock_alerts', { inApp: v })} testid="toggle-low-stock" /></SettingRow>
        <SettingRow title="Negative stock in-app alerts"><Toggle checked={!!s.negative_stock_alerts?.inApp} onChange={v => updateAlert('negative_stock_alerts', { inApp: v })} /></SettingRow>
        <SettingRow title="Expiry in-app alerts"><Toggle checked={!!s.expiry_alerts?.inApp} onChange={v => updateAlert('expiry_alerts', { inApp: v })} /></SettingRow>
        <SettingRow title="Expiry lead time (days)"><Input type="number" className="w-24" value={s.expiry_alerts?.daysBefore ?? 30} onChange={e => updateAlert('expiry_alerts', { daysBefore: Number(e.target.value) })} /></SettingRow>
        <SettingRow title="Default low stock level"><Input type="number" className="w-24" value={s.default_low_stock_level ?? 20} onChange={e => config.setValue({ ...s, default_low_stock_level: Number(e.target.value) })} /></SettingRow>
      </Card>
      </ConfigState>
    </Section>
  );
}

/* ── Documents ────────────────────────────────────────────────────────────── */
export function SettingsVoucherConfig() {
  return <VoucherConfigPanel />;
}

export function SettingsEInvoice() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const compliance = useRemoteConfig(guid ? `/api/company/${encodeURIComponent(guid)}/compliance-config` : '', {
    e_invoice_applicable: 'not_applicable', e_invoice_mode: 'manual',
  }, { method: 'POST' });
  const integration = useRemoteConfig('/api/integration-settings', { einvoice: { gstin: '', username: '', client_id: '', client_secret: '' } });
  const creds = integration.value.einvoice || {};
  return (
    <Section title="E-Invoice Settings" sub="IRN generation via your GSP" testid="settings-einvoice">
      <ConfigState config={compliance}>
      <Card>
        <SettingRow title="Applicability">
          <Select className="w-48" data-testid="toggle-einvoice" value={compliance.value.e_invoice_applicable} onChange={e => compliance.setValue({ ...compliance.value, e_invoice_applicable: e.target.value })}>
             <option value="not_applicable">{lt('Not applicable')}</option><option value="applicable_configured">{lt('Applicable and configured')}</option>
          </Select>
        </SettingRow>
         <SettingRow title="Generation mode"><Select className="w-48" value={compliance.value.e_invoice_mode} onChange={e => compliance.setValue({ ...compliance.value, e_invoice_mode: e.target.value })}><option value="manual">{lt('Manual')}</option><option value="auto">{lt('Automatic')}</option></Select></SettingRow>
        <div className="flex justify-end p-4"><SaveAction config={compliance} testid="einvoice-compliance-save" /></div>
      </Card>
      </ConfigState>
      <ConfigState config={integration}>
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="GSTIN"><Input value={creds.gstin || ''} onChange={e => integration.setValue({ ...integration.value, einvoice: { ...creds, gstin: e.target.value } })} /></Field>
          <Field label="API username"><Input value={creds.username || ''} onChange={e => integration.setValue({ ...integration.value, einvoice: { ...creds, username: e.target.value } })} /></Field>
          <Field label="Client ID"><Input data-testid="gsp-select" value={creds.client_id || ''} onChange={e => integration.setValue({ ...integration.value, einvoice: { ...creds, client_id: e.target.value } })} /></Field>
          <Field label="Client secret"><Input type="password" value={creds.client_secret || ''} onChange={e => integration.setValue({ ...integration.value, einvoice: { ...creds, client_secret: e.target.value } })} /></Field>
          <div className="sm:col-span-2 flex justify-end"><SaveAction config={integration} testid="einvoice-credentials-save" /></div>
        </Card>
      </ConfigState>
    </Section>
  );
}

export function SettingsEWB() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const compliance = useRemoteConfig(guid ? `/api/company/${encodeURIComponent(guid)}/compliance-config` : '', {
    e_way_bill_applicable: 'not_applicable', e_way_bill_mode: 'manual',
  }, { method: 'POST' });
  const integration = useRemoteConfig('/api/integration-settings', { ewaybill: { gstin: '', username: '' } });
  const creds = integration.value.ewaybill || {};
  return (
    <Section title="E-Way Bill Settings" sub="Consignment rules and transporter defaults" testid="settings-ewb">
      <ConfigState config={compliance}>
      <Card>
         <SettingRow title="Applicability"><Select className="w-48" data-testid="toggle-ewb" value={compliance.value.e_way_bill_applicable} onChange={e => compliance.setValue({ ...compliance.value, e_way_bill_applicable: e.target.value })}><option value="not_applicable">{lt('Not applicable')}</option><option value="applicable_configured">{lt('Applicable and configured')}</option></Select></SettingRow>
         <SettingRow title="Generation mode"><Select className="w-48" value={compliance.value.e_way_bill_mode} onChange={e => compliance.setValue({ ...compliance.value, e_way_bill_mode: e.target.value })}><option value="manual">{lt('Manual')}</option><option value="auto">{lt('Automatic')}</option></Select></SettingRow>
        <div className="flex justify-end p-4"><SaveAction config={compliance} testid="ewb-compliance-save" /></div>
      </Card>
      </ConfigState>
      <ConfigState config={integration}>
        <Card className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="GSTIN"><Input value={creds.gstin || ''} onChange={e => integration.setValue({ ...integration.value, ewaybill: { ...creds, gstin: e.target.value } })} /></Field>
          <Field label="API username"><Input value={creds.username || ''} onChange={e => integration.setValue({ ...integration.value, ewaybill: { ...creds, username: e.target.value } })} /></Field>
          <div className="sm:col-span-2 flex justify-end"><SaveAction config={integration} testid="ewb-credentials-save" /></div>
        </Card>
      </ConfigState>
    </Section>
  );
}

export function SettingsBarcodes() {
  const lt = useLabelT();
  const navigate = useNavigate();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const config = useRemoteConfig(guid ? `/api/inventory/barcodes/settings?companyGuid=${encodeURIComponent(guid)}` : '', {
    barcodeStorageMode: 'app_only', defaultBarcodeType: 'CODE128', autoSyncToTally: false,
  }, {
    method: 'POST',
    savePath: '/api/inventory/barcodes/settings',
    serialize: value => ({ companyGuid: guid, ...value }),
  });
  const s = config.value;
  return (
    <Section title="Barcode Settings" sub="Symbology and scanner behaviour" testid="settings-barcodes"
       actions={<><Button data-testid="open-print-settings" onClick={() => navigate('/inventory/print-settings')}>{lt('Print settings')}</Button><SaveAction config={config} testid="barcode-settings-save" /></>}>
      <ConfigState config={config}>
      <Card>
        <SettingRow title="Default barcode type">
          <Select className="w-44" data-testid="symbology-select" value={s.defaultBarcodeType} onChange={e => config.setValue({ ...s, defaultBarcodeType: e.target.value })}>{['CODE128', 'EAN13', 'EAN8', 'UPC', 'QR', 'INTERNAL'].map(o => <option key={o}>{o}</option>)}</Select>
        </SettingRow>
         <SettingRow title="Barcode storage"><Select className="w-56" value={s.barcodeStorageMode} onChange={e => config.setValue({ ...s, barcodeStorageMode: e.target.value })}><option value="app_only">{lt('App only')}</option><option value="tally_alias">{lt('Tally alias')}</option><option value="tally_part_number">{lt('Tally part number')}</option><option value="tally_udf">{lt('Tally UDF')}</option></Select></SettingRow>
        <SettingRow title="Automatically sync barcodes to Tally"><Toggle checked={!!s.autoSyncToTally} onChange={v => config.setValue({ ...s, autoSyncToTally: v })} testid="toggle-auto-barcode" /></SettingRow>
      </Card>
      </ConfigState>
    </Section>
  );
}

/* ── License / about / help ───────────────────────────────────────────────── */
export function SettingsLicense() {
  return (
    <Section title="License" sub="Subscription and entitlement" testid="settings-license">
      <Card><Empty message="Not yet available on web" hint="The backend does not expose subscription or license details." /></Card>
    </Section>
  );
}

export function SettingsAbout() {
  const lt = useLabelT();
  return (
    <Section title="About" sub="Build and environment details" testid="settings-about">
      <Card className="p-5">
         <KV label="Product" value={lt('TallyDekho Web Portal')} />
         <KV label="Version" value={lt('2.0.0 (parity build)')} mono />
         <KV label="Data source" value={lt('Live TallyDekho backend')} />
         <KV label="API mode" value={lt('Same-origin /app, /api and /tally services')} code />
        <KV label="Support" value="support@tallydekho.com" />
      </Card>
    </Section>
  );
}

export function SettingsHelp() {
  const lt = useLabelT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState('');
  const faqs = [
    ['How do I connect my Tally data?', 'Install the TallyDekho desktop agent on the machine running Tally Prime, open Settings → Tally Sync, and enter the pairing code shown by the agent.'],
    ['Why is a page empty?', 'The portal shows data returned by your live TallyDekho backend for the selected company and financial year. Pair the desktop agent and complete a sync if records are missing.'],
    ['Can I create vouchers from the web?', 'Yes. Use the Create menu in the top bar. Entries are queued and written into Tally by the desktop agent; you can track them under Audit Trail.'],
    ['How is stock valued?', 'Inventory → Settings lets you pick FIFO, LIFO, average cost or standard cost. Valuation Summary shows the method used per category.'],
    ['Who can see my data?', 'Data stays between your Tally machine and your workspace. Roles under Profile control what each user can open.'],
  ];

  const ask = async () => {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAskErr('');
    try {
      const res = await api.askHelpAI(question.trim(), history);
      const reply = res?.data?.reply || res?.data?.answer || res?.reply || res?.message || JSON.stringify(res?.data || res);
      const nextHistory = [...history, { role: 'user', content: question.trim() }, { role: 'assistant', content: String(reply) }];
      setHistory(nextHistory.slice(-12));
      setAnswer(String(reply));
      setQuestion('');
    } catch (err) {
      setAskErr(err?.message || lt('Unable to reach Help AI'));
    } finally {
      setAsking(false);
    }
  };

  return (
    <Section title="Help & FAQ" sub="Common questions about the portal" testid="settings-help">
      <Card className="p-5">
        <SettingRow title="App guide" desc="Replay the onboarding tour">
          <Button data-testid="settings-app-guide" onClick={() => { clearOnboardingForReplay(); navigate('/onboarding?replay=true'); }}>{lt('Open guide')}</Button>
        </SettingRow>
      </Card>
      <Card className="p-5 space-y-3" data-testid="help-ai-panel">
        <p className="text-sm font-bold text-ink">{lt('Ask Help AI')}</p>
        <p className="text-[13px] text-ink-soft">{lt('Same assistant as the mobile Help screen — asks /api/ai/help.')}</p>
        <Textarea data-testid="help-ai-input" rows={3} value={question} onChange={e => setQuestion(e.target.value)} placeholder={lt('Ask how to pair Tally, create a voucher, fix empty pages…')} />
        <div className="flex items-center gap-2">
          <Button variant="primary" data-testid="help-ai-ask" disabled={asking || !question.trim()} onClick={ask}>{asking ? lt('Thinking…') : lt('Ask')}</Button>
          {history.length > 0 && <Button variant="ghost" onClick={() => { setHistory([]); setAnswer(''); }}>{lt('Clear chat')}</Button>}
        </div>
        {askErr && <p className="text-[13px] text-neg">{askErr}</p>}
        {answer && <div className="rounded-lg bg-cream px-4 py-3 text-[13px] leading-relaxed text-ink whitespace-pre-wrap" data-testid="help-ai-answer">{answer}</div>}
      </Card>
      <Card className="divide-y divide-line-subtle">
        {faqs.map(([q, a], i) => (
          <div key={i}>
            <button data-testid={`faq-${i}`} onClick={() => setOpen(o => (o === i ? null : i))} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-cream transition-colors">
               <span className="text-[13px] font-medium text-ink flex-1">{lt(q)}</span>
              <ChevronRight size={13} className={`text-ink-faint transition-transform ${open === i ? 'rotate-90' : ''}`} />
            </button>
             {open === i && <p className="px-5 pb-4 text-[13px] leading-relaxed text-ink-soft">{lt(a)}</p>}
          </div>
        ))}
      </Card>
    </Section>
  );
}
