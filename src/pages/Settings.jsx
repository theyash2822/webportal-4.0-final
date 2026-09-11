import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Check, ChevronRight, ChevronDown, ChevronUp, Plus, Search, Trash2, X } from 'lucide-react';
import {
  Card, Button, DataTable, Pill, Toggle, SettingRow, Select, Input,
  Field, KV, Textarea, Empty, Skeleton, Modal, useLabelT,
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
import { getAuthToken } from '../utils/authStorage';
import { formatBankCardNumber } from '../utils/voucherConfig';

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
  const token = getAuthToken();
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
        companyName: selectedCompany.name,
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
              { key: 'name', label: 'Bank ledger', render: r => <span className="font-medium">{r.bank_name || r.name}</span> },
              {
                key: 'account_number',
                label: 'Account no.',
                render: r => {
                  const ac = r.account_number || r.accountNo || '';
                  return ac
                    ? <span className="font-mono text-[12px] tracking-wide">{formatBankCardNumber(ac)}</span>
                    : <span className="text-ink-faint">{lt('A/c not in sync yet')}</span>;
                },
              },
              {
                key: 'ifsc',
                label: 'IFSC',
                render: r => r.ifsc || r.ifsc_code || '—',
              },
              {
                key: 'branch',
                label: 'Branch',
                render: r => r.branch || '—',
              },
              { key: 'parent', label: 'Under group' },
              { key: 'balance_type', label: 'Dr/Cr', render: r => <Pill tone={r.balance_type === 'Dr' ? 'pos' : 'warn'}>{r.balance_type || '—'}</Pill> },
              { key: 'closing_balance', label: 'Closing balance', align: 'right', render: r => money(Math.abs(Number(r.closing_balance) || 0)) },
            ]} />
          )}
        </div>
         <p className="mt-3 text-[11px] text-ink-faint">{lt('Account number, IFSC and branch come from Tally bank masters (same as mobile). Edits to existing ledgers are made in Tally Prime.')}</p>
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
const ALERT_CHANNELS = ['push', 'email', 'whatsapp', 'sms'];
const DEFAULT_ALERT_CHANNELS = { push: true, email: false, whatsapp: false, sms: false };
const EXPIRY_DAY_OPTIONS = ['7 Days', '15 Days', '30 Days', '60 Days', '90 Days'];
const EINVOICE_PROVIDERS = [
  { value: 'nic', label: 'NIC (Government)' },
  { value: 'cygnet', label: 'Cygnet' },
  { value: 'clear', label: 'Clear (formerly ClearTax)' },
  { value: 'ey', label: 'EY Tax Tech' },
  { value: 'iris', label: 'IRIS Business' },
  { value: 'masterindia', label: 'Masterindia' },
];
const EWB_GSP_OPTIONS = [
  { value: 'nic', label: 'NIC Direct' },
  { value: 'cleartax', label: 'Cleartax GSP' },
  { value: 'masters', label: 'Masters India' },
];

function normalizeChannels(ch = {}) {
  return {
    push: !!(ch.push ?? ch.push_enabled ?? DEFAULT_ALERT_CHANNELS.push),
    email: !!(ch.email ?? ch.email_enabled ?? DEFAULT_ALERT_CHANNELS.email),
    whatsapp: !!(ch.whatsapp ?? ch.whatsapp_enabled ?? DEFAULT_ALERT_CHANNELS.whatsapp),
    sms: !!(ch.sms ?? ch.sms_enabled ?? DEFAULT_ALERT_CHANNELS.sms),
  };
}

function ChannelChips({ value, onChange, testid }) {
  const lt = useLabelT();
  const channels = normalizeChannels(value);
  return (
    <div data-testid={testid}>
      <p className="mb-2 text-[12px] font-semibold text-ink">{lt('Channels')}</p>
      <div className="flex flex-wrap gap-2">
        {ALERT_CHANNELS.map(key => {
          const active = !!channels[key];
          return (
            <button
              key={key}
              type="button"
              data-testid={`${testid || 'channel'}-${key}`}
              onClick={() => onChange({ ...channels, [key]: !active })}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize ${
                active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
              }`}
            >
              {lt(key === 'push' ? 'Push' : key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepperBox({ label, value, sublabel, onChange, min = 1, max = 30, testid }) {
  const lt = useLabelT();
  const n = Number(value) || min;
  return (
    <div className="flex-1 rounded-xl border border-line bg-cream p-3 text-center" data-testid={testid}>
      <p className="text-[11px] font-semibold text-ink-soft">{lt(label)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Button disabled={n <= min} onClick={() => onChange(Math.max(min, n - 1))} data-testid={testid ? `${testid}-dec` : undefined}>−</Button>
        <span className="min-w-[2rem] text-lg font-bold tabular-nums text-ink">{n}</span>
        <Button disabled={n >= max} onClick={() => onChange(Math.min(max, n + 1))} data-testid={testid ? `${testid}-inc` : undefined}>+</Button>
      </div>
      {sublabel && <p className="mt-1 text-[10px] text-ink-faint">{lt(sublabel)}</p>}
    </div>
  );
}

function normalizeNotificationSettings(data = {}) {
  return {
    push_enabled: !!(data.push_enabled ?? data.push ?? true),
    email_enabled: !!(data.email_enabled ?? data.email ?? true),
    sms_enabled: !!(data.sms_enabled ?? data.sms ?? false),
    whatsapp_enabled: !!(data.whatsapp_enabled ?? data.whatsapp ?? true),
    digest: data.digest || 'Daily',
    quiet_enabled: !!data.quiet_enabled,
    quiet_from: data.quiet_from || '10:00 PM',
    quiet_to: data.quiet_to || '07:00 AM',
    quiet_saturday: !!(data.quiet_saturday ?? false),
    quiet_sunday: data.quiet_sunday === undefined ? true : !!data.quiet_sunday,
  };
}

export function SettingsNotificationChannels() {
  const lt = useLabelT();
  const config = useRemoteConfig('/api/notification-settings', normalizeNotificationSettings(), {
    select: (response) => normalizeNotificationSettings(response?.data || {}),
    serialize: (value) => normalizeNotificationSettings(value),
  });
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
  const patch = (partial) => config.setValue({ ...s, ...partial });
  return (
    <Section title="Channels & Quiet Hours" sub="Where alerts are delivered and when to stay silent" testid="settings-notification-channels" actions={<SaveAction config={config} testid="notification-save" />}>
      <ConfigState config={config}>
      <Card>
        <SettingRow title="In-app / push"><Toggle checked={!!s.push_enabled} onChange={v => patch({ push_enabled: v })} testid="toggle-push" /></SettingRow>
        <SettingRow title="Browser push (FCM)" desc={pushPerm === 'granted' ? lt('Permission granted') : pushPerm === 'denied' ? lt('Blocked in browser settings') : lt('Enable desktop notifications')}>
          <Button disabled={pushBusy || pushPerm === 'denied'} onClick={enableBrowserPush} data-testid="enable-browser-push">
            {pushBusy ? lt('Enabling…') : lt('Enable browser push')}
          </Button>
        </SettingRow>
        {pushMsg && <p className="px-5 pb-3 text-[13px] text-ink-soft">{pushMsg}</p>}
        <SettingRow title="Email"><Toggle checked={!!s.email_enabled} onChange={v => patch({ email_enabled: v })} testid="toggle-email" /></SettingRow>
        <SettingRow title="SMS"><Toggle checked={!!s.sms_enabled} onChange={v => patch({ sms_enabled: v })} testid="toggle-sms" /></SettingRow>
        <SettingRow title="WhatsApp"><Toggle checked={!!s.whatsapp_enabled} onChange={v => patch({ whatsapp_enabled: v })} testid="toggle-whatsapp" /></SettingRow>
        <SettingRow title="Summary digest">
          <Select className="w-40" data-testid="digest-select" value={s.digest} onChange={e => patch({ digest: e.target.value })}>
             {['Off', 'Daily', 'Weekly'].map(o => <option key={o} value={o}>{lt(o)}</option>)}
          </Select>
        </SettingRow>
      </Card>
      <Card>
        <SettingRow title="Quiet Hours" desc="Mute non-critical alerts overnight">
          <Toggle checked={!!s.quiet_enabled} onChange={v => patch({ quiet_enabled: v })} testid="toggle-quiet-hours" />
        </SettingRow>
        {s.quiet_enabled && (
          <div className="space-y-4 border-t border-line px-5 py-4" data-testid="quiet-hours-body">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Start time">
                <Input
                  data-testid="quiet-from"
                  value={s.quiet_from || ''}
                  onChange={e => patch({ quiet_from: e.target.value })}
                  placeholder={lt('10:00 PM')}
                />
              </Field>
              <Field label="End time">
                <Input
                  data-testid="quiet-to"
                  value={s.quiet_to || ''}
                  onChange={e => patch({ quiet_to: e.target.value })}
                  placeholder={lt('07:00 AM')}
                />
              </Field>
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold text-ink">{lt('Weekends')}</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'quiet_saturday', label: 'Saturday' },
                  { key: 'quiet_sunday', label: 'Sunday' },
                ].map(day => {
                  const active = !!s[day.key];
                  return (
                    <button
                      key={day.key}
                      type="button"
                      data-testid={`quiet-${day.key}`}
                      onClick={() => patch({ [day.key]: !active })}
                      className={`min-w-[7rem] flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-semibold ${
                        active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                      }`}
                    >
                      {lt(day.label)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>
      </ConfigState>
    </Section>
  );
}

const REMINDER_ORDINALS = ['First', 'Second', 'Third', 'Fourth'];
const MAX_PAYMENT_REMINDERS = 4;

function defaultPaymentReminder(index = 0) {
  return {
    id: `r${index + 1}`,
    name: `${REMINDER_ORDINALS[index] || 'Reminder'} Reminder`,
    daysBefore: index === 0 ? 3 : 0,
    time: index === 0 ? '10:00 AM' : '09:00 AM',
    onDueDate: index === 1,
    enabled: index < 2,
    channels: {
      email: index === 1,
      whatsapp: index === 0,
      sms: false,
    },
    exceptions: [],
  };
}

function normalizePaymentReminders(list) {
  if (!Array.isArray(list) || !list.length) {
    return [defaultPaymentReminder(0), defaultPaymentReminder(1)];
  }
  return list.slice(0, MAX_PAYMENT_REMINDERS).map((r, i) => ({
    id: r.id || `r${i + 1}`,
    name: r.name || `${REMINDER_ORDINALS[i]} Reminder`,
    daysBefore: Number.isFinite(Number(r.daysBefore)) ? Number(r.daysBefore) : 0,
    time: r.time || '09:00 AM',
    onDueDate: !!r.onDueDate,
    enabled: !!r.enabled,
    channels: {
      email: !!r.channels?.email,
      whatsapp: !!r.channels?.whatsapp,
      sms: !!r.channels?.sms,
    },
    exceptions: Array.isArray(r.exceptions) ? r.exceptions : [],
  }));
}

export function SettingsPaymentReminders() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const config = useRemoteConfig('/api/alert-settings', {
    payment_reminders: {
      threshold: 500,
      reminders: [defaultPaymentReminder(0), defaultPaymentReminder(1)],
    },
  });
  const payment = config.value.payment_reminders || {};
  const reminders = normalizePaymentReminders(payment.reminders);
  const [expanded, setExpanded] = useState(() => new Set());
  const [pickerForId, setPickerForId] = useState(null);
  const [partyOptions, setPartyOptions] = useState([]);
  const [partyLoading, setPartyLoading] = useState(false);
  const [partySearch, setPartySearch] = useState('');
  const [draftExceptions, setDraftExceptions] = useState([]);

  // Hydrate empty/missing reminder list (mobile defaults to two cards) and expand first.
  useEffect(() => {
    if (!config.loaded) return;
    const pr = config.value.payment_reminders || {};
    const raw = pr.reminders;
    const normalized = normalizePaymentReminders(raw);
    if (!Array.isArray(raw) || raw.length === 0) {
      config.setValue({
        ...config.value,
        payment_reminders: { ...pr, threshold: pr.threshold ?? 500, reminders: normalized },
      });
    }
    setExpanded(prev => (prev.size ? prev : new Set([normalized[0]?.id].filter(Boolean))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when load completes
  }, [config.loaded]);

  const setPayment = (patch) => {
    config.setValue({
      ...config.value,
      payment_reminders: { ...payment, ...patch },
    });
  };

  const setReminders = (next) => setPayment({ reminders: next });

  const updateReminder = (id, patch) => {
    setReminders(reminders.map(r => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateChannels = (id, key) => {
    const row = reminders.find(r => r.id === id);
    if (!row) return;
    updateReminder(id, {
      channels: { ...row.channels, [key]: !row.channels?.[key] },
    });
  };

  const addReminder = () => {
    if (reminders.length >= MAX_PAYMENT_REMINDERS) return;
    const next = {
      ...defaultPaymentReminder(reminders.length),
      id: `r${Date.now()}`,
      enabled: false,
      onDueDate: false,
      channels: { email: false, whatsapp: false, sms: false },
      time: '',
    };
    setReminders([...reminders, next]);
    setExpanded(prev => new Set([...prev, next.id]));
  };

  const removeReminder = (id) => {
    if (reminders.length <= 1) return;
    setReminders(reminders.filter(r => r.id !== id));
    setExpanded(prev => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const openExceptionPicker = async (reminder) => {
    setPickerForId(reminder.id);
    setDraftExceptions([...(reminder.exceptions || [])]);
    setPartySearch('');
    if (!selectedCompany?.guid) return;
    setPartyLoading(true);
    try {
      const [debtors, creditors] = await Promise.all([
        api.fetchLedgers({ companyGuid: selectedCompany.guid, group: 'Sundry Debtors', limit: 200, pageSize: 200 }),
        api.fetchLedgers({ companyGuid: selectedCompany.guid, group: 'Sundry Creditors', limit: 200, pageSize: 200 }),
      ]);
      const names = new Set();
      [...(api.unwrapList(debtors) || []), ...(api.unwrapList(creditors) || [])].forEach(row => {
        const n = String(row?.name || '').trim();
        if (n) names.add(n);
      });
      setPartyOptions([...names].sort((a, b) => a.localeCompare(b)));
    } catch {
      setPartyOptions([]);
    } finally {
      setPartyLoading(false);
    }
  };

  const filteredParties = partySearch.trim()
    ? partyOptions.filter(n => n.toLowerCase().includes(partySearch.trim().toLowerCase()))
    : partyOptions;

  return (
    <Section
      title="Payment Reminders"
      sub="Automatic follow-ups on overdue receivables — up to 4 reminders (mobile parity)"
      testid="settings-payment-reminders"
      actions={<SaveAction config={config} testid="payment-reminders-save" />}
    >
      <ConfigState config={config}>
        <Card>
          <SettingRow title="Minimum outstanding" desc="Don't send reminders for invoices below this amount">
            <Input
              type="number"
              className="w-32"
              data-testid="payment-reminders-threshold"
              value={payment.threshold ?? 0}
              onChange={e => setPayment({ threshold: Number(e.target.value) })}
            />
          </SettingRow>
        </Card>

        <div className="space-y-3" data-testid="payment-reminders-list">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">{lt('List of Reminders')}</p>
          {reminders.map((reminder, index) => {
            const isOpen = expanded.has(reminder.id);
            const exceptions = reminder.exceptions || [];
            return (
              <Card key={reminder.id} className="overflow-hidden p-0" data-testid={`payment-reminder-card-${index}`}>
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <Input
                    className="h-9 flex-1"
                    value={reminder.name}
                    onChange={e => updateReminder(reminder.id, { name: e.target.value })}
                    placeholder={lt(`${REMINDER_ORDINALS[index]} Reminder`)}
                    data-testid={`payment-reminder-name-${index}`}
                  />
                  <Toggle
                    checked={!!reminder.enabled}
                    onChange={v => updateReminder(reminder.id, { enabled: v })}
                    testid={`payment-reminder-enabled-${index}`}
                  />
                  <button
                    type="button"
                    aria-label={lt(isOpen ? 'Collapse' : 'Expand')}
                    className="rounded-lg border border-line p-2 text-ink-soft hover:bg-cream"
                    onClick={() => setExpanded(prev => {
                      const n = new Set(prev);
                      if (n.has(reminder.id)) n.delete(reminder.id);
                      else n.add(reminder.id);
                      return n;
                    })}
                  >
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="space-y-4 px-4 py-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Days before due">
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => updateReminder(reminder.id, { daysBefore: Math.max(0, Number(reminder.daysBefore || 0) - 1) })}
                            data-testid={`payment-reminder-days-dec-${index}`}
                          >
                            −
                          </Button>
                          <Input
                            type="number"
                            min="0"
                            className="w-20 text-center"
                            value={reminder.daysBefore}
                            onChange={e => updateReminder(reminder.id, { daysBefore: Math.max(0, Number(e.target.value) || 0) })}
                            data-testid={`payment-reminder-days-${index}`}
                          />
                          <Button
                            onClick={() => updateReminder(reminder.id, { daysBefore: Number(reminder.daysBefore || 0) + 1 })}
                            data-testid={`payment-reminder-days-inc-${index}`}
                          >
                            +
                          </Button>
                        </div>
                      </Field>
                      <Field label="Send time">
                        <Input
                          value={reminder.time || ''}
                          onChange={e => updateReminder(reminder.id, { time: e.target.value })}
                          placeholder={lt('09:00 AM')}
                          data-testid={`payment-reminder-time-${index}`}
                        />
                      </Field>
                    </div>

                    <SettingRow title="On due date" desc="Send on the invoice due date instead of days-before">
                      <Toggle
                        checked={!!reminder.onDueDate}
                        onChange={v => updateReminder(reminder.id, { onDueDate: v })}
                        testid={`payment-reminder-on-due-${index}`}
                      />
                    </SettingRow>

                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-ink">{lt('Channels')}</p>
                      <div className="flex flex-wrap gap-2">
                        {['email', 'whatsapp', 'sms'].map(ch => {
                          const active = !!reminder.channels?.[ch];
                          return (
                            <button
                              key={ch}
                              type="button"
                              data-testid={`payment-reminder-channel-${ch}-${index}`}
                              onClick={() => updateChannels(reminder.id, ch)}
                              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize ${
                                active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                              }`}
                            >
                              {lt(ch)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[12px] font-semibold text-ink">
                          {lt('Exceptions')}{exceptions.length ? ` (${exceptions.length})` : ''}
                        </p>
                        <Button
                          data-testid={`payment-reminder-exceptions-${index}`}
                          onClick={() => openExceptionPicker(reminder)}
                        >
                          {lt('Manage')}
                        </Button>
                      </div>
                      {exceptions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {exceptions.map(name => (
                            <span key={name} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-cream px-2.5 py-1 text-[12px] text-ink">
                              <span className="truncate">{name}</span>
                              <button
                                type="button"
                                aria-label={lt('Remove')}
                                className="text-ink-faint hover:text-ink"
                                onClick={() => updateReminder(reminder.id, {
                                  exceptions: exceptions.filter(e => e !== name),
                                })}
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {index > 0 && (
                      <Button
                        className="text-neg"
                        data-testid={`payment-reminder-remove-${index}`}
                        onClick={() => removeReminder(reminder.id)}
                      >
                        <Trash2 size={14} /> {lt('Remove Reminder')}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {reminders.length < MAX_PAYMENT_REMINDERS ? (
          <Button
            className="w-full"
            data-testid="payment-reminders-add"
            onClick={addReminder}
          >
            <Plus size={16} /> {lt('Add Reminder')}
            <span className="ml-auto text-[11px] text-ink-faint">{reminders.length}/{MAX_PAYMENT_REMINDERS}</span>
          </Button>
        ) : (
          <p className="text-center text-[12px] text-ink-faint" data-testid="payment-reminders-max">
            {lt('Maximum 4 reminders reached')}
          </p>
        )}
      </ConfigState>

      {pickerForId && (
        <Modal
          open
          onClose={() => setPickerForId(null)}
          title={lt('Exception parties')}
          testid="payment-reminders-exception-modal"
          footer={(
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPickerForId(null)}>{lt('Cancel')}</Button>
              <Button
                variant="primary"
                data-testid="payment-reminders-exceptions-save"
                onClick={() => {
                  updateReminder(pickerForId, { exceptions: draftExceptions });
                  setPickerForId(null);
                }}
              >
                {lt('Save exceptions')}
              </Button>
            </div>
          )}
        >
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-cream px-3 py-2">
            <Search size={14} className="text-ink-faint" />
            <input
              value={partySearch}
              onChange={e => setPartySearch(e.target.value)}
              placeholder={lt('Search parties…')}
              data-testid="payment-reminders-exception-search"
              className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
            />
          </div>
          {partyLoading ? (
            <p className="py-6 text-center text-[13px] text-ink-faint">{lt('Loading parties…')}</p>
          ) : filteredParties.length === 0 ? (
            <Empty message="No parties found" hint="Sundry Debtors and Creditors from Tally appear here." />
          ) : (
            <div className="max-h-[45vh] space-y-1 overflow-y-auto">
              {filteredParties.map(name => {
                const checked = draftExceptions.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDraftExceptions(prev => (
                      checked ? prev.filter(n => n !== name) : [...prev, name]
                    ))}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${checked ? 'bg-cream font-semibold text-ink' : 'text-ink-soft hover:bg-cream'}`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-ink bg-ink text-white' : 'border-line-strong'}`}>
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}
    </Section>
  );
}

function defaultComplianceReminders() {
  return {
    gst: {
      gstr1Days: 3,
      gstr3bDays: 3,
      autoPause: true,
      channels: { ...DEFAULT_ALERT_CHANNELS, push: true },
    },
    einvoice: {
      irnDays: 3,
      channels: { ...DEFAULT_ALERT_CHANNELS, push: true },
    },
    ewb: {
      expiryHours: 4,
      channels: { ...DEFAULT_ALERT_CHANNELS, push: true },
    },
    other_taxes: {
      tdsDays: 3,
      vatDays: 3,
      channels: { ...DEFAULT_ALERT_CHANNELS, push: true },
    },
  };
}

function normalizeComplianceReminders(raw = {}, legacyCompliance = {}) {
  const defaults = defaultComplianceReminders();
  const src = raw && typeof raw === 'object' ? raw : {};
  const gstSrc = src.gst || {};
  return {
    gst: {
      gstr1Days: Number(gstSrc.gstr1Days ?? legacyCompliance.gstr1FilingDays ?? defaults.gst.gstr1Days),
      gstr3bDays: Number(gstSrc.gstr3bDays ?? legacyCompliance.gstr3bFilingDays ?? defaults.gst.gstr3bDays),
      autoPause: gstSrc.autoPause === undefined ? defaults.gst.autoPause : !!gstSrc.autoPause,
      channels: normalizeChannels(gstSrc.channels || defaults.gst.channels),
    },
    einvoice: {
      irnDays: Number(src.einvoice?.irnDays ?? defaults.einvoice.irnDays),
      channels: normalizeChannels(src.einvoice?.channels || defaults.einvoice.channels),
    },
    ewb: {
      expiryHours: Number(src.ewb?.expiryHours ?? defaults.ewb.expiryHours),
      channels: normalizeChannels(src.ewb?.channels || defaults.ewb.channels),
    },
    other_taxes: {
      tdsDays: Number(src.other_taxes?.tdsDays ?? defaults.other_taxes.tdsDays),
      vatDays: Number(src.other_taxes?.vatDays ?? defaults.other_taxes.vatDays),
      channels: normalizeChannels(src.other_taxes?.channels || defaults.other_taxes.channels),
    },
  };
}

export function SettingsComplianceReminders() {
  const lt = useLabelT();
  const config = useRemoteConfig('/api/alert-settings', {
    compliance_reminders: defaultComplianceReminders(),
  }, {
    select: (response) => {
      const data = response?.data || {};
      return {
        ...data,
        compliance_reminders: normalizeComplianceReminders(data.compliance_reminders, data.compliance),
      };
    },
    serialize: (value) => ({
      compliance_reminders: normalizeComplianceReminders(value.compliance_reminders),
    }),
  });
  const reminders = normalizeComplianceReminders(config.value.compliance_reminders);
  const setReminders = (patch) => {
    config.setValue({
      ...config.value,
      compliance_reminders: normalizeComplianceReminders({ ...reminders, ...patch }),
    });
  };
  const setGst = (patch) => setReminders({ gst: { ...reminders.gst, ...patch } });
  const setEinv = (patch) => setReminders({ einvoice: { ...reminders.einvoice, ...patch } });
  const setEwb = (patch) => setReminders({ ewb: { ...reminders.ewb, ...patch } });
  const setOther = (patch) => setReminders({ other_taxes: { ...reminders.other_taxes, ...patch } });

  return (
    <Section
      title="Compliance Reminders"
      sub="GST, e-invoice, e-way bill, and other tax due-date alerts"
      testid="settings-compliance-reminders"
      actions={<SaveAction config={config} testid="compliance-reminders-save" />}
    >
      <ConfigState config={config}>
        <Card className="space-y-4 p-5" data-testid="compliance-gst-card">
          <p className="text-sm font-bold text-ink">{lt('GST')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <StepperBox label="GSTR-1 filing" value={reminders.gst.gstr1Days} sublabel="Days before due" onChange={v => setGst({ gstr1Days: v })} testid="lead-time" />
            <StepperBox label="GSTR-3B filing" value={reminders.gst.gstr3bDays} sublabel="Days before due" onChange={v => setGst({ gstr3bDays: v })} testid="gstr3b-days" />
          </div>
          <SettingRow title="Auto-pause" desc="If No Sales">
            <Toggle checked={!!reminders.gst.autoPause} onChange={v => setGst({ autoPause: v })} testid="gst-auto-pause" />
          </SettingRow>
          <ChannelChips value={reminders.gst.channels} onChange={channels => setGst({ channels })} testid="gst-channels" />
        </Card>

        <Card className="space-y-4 p-5" data-testid="compliance-einvoice-card">
          <p className="text-sm font-bold text-ink">{lt('E-Invoice')}</p>
          <StepperBox label="IRN error digest" value={reminders.einvoice.irnDays} sublabel="Days before due" onChange={v => setEinv({ irnDays: v })} testid="einvoice-irn-days" />
          <ChannelChips value={reminders.einvoice.channels} onChange={channels => setEinv({ channels })} testid="einvoice-channels" />
        </Card>

        <Card className="space-y-4 p-5" data-testid="compliance-ewb-card">
          <p className="text-sm font-bold text-ink">{lt('E-Way Bill')}</p>
          <StepperBox label="Expiry reminder" value={reminders.ewb.expiryHours} sublabel="h before validity end" onChange={v => setEwb({ expiryHours: v })} min={1} max={72} testid="ewb-expiry-hours" />
          <ChannelChips value={reminders.ewb.channels} onChange={channels => setEwb({ channels })} testid="ewb-channels" />
        </Card>

        <Card className="space-y-4 p-5" data-testid="compliance-other-taxes-card">
          <p className="text-sm font-bold text-ink">{lt('Other Taxes')}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <StepperBox label="TDS payment" value={reminders.other_taxes.tdsDays} sublabel="Days before 7th" onChange={v => setOther({ tdsDays: v })} testid="tds-days" />
            <StepperBox label="VAT return" value={reminders.other_taxes.vatDays} sublabel="Days before due" onChange={v => setOther({ vatDays: v })} testid="vat-days" />
          </div>
          <ChannelChips value={reminders.other_taxes.channels} onChange={channels => setOther({ channels })} testid="other-tax-channels" />
        </Card>
      </ConfigState>
    </Section>
  );
}

function defaultStockAlerts() {
  return {
    category: 'group',
    selected_entries: [],
    include_negative: false,
    expiry_days: '30 Days',
    tracked_batches: true,
    group_by_warehouse: false,
    channels: { push: true, email: false, whatsapp: true, sms: false },
    frequency: 'daily',
    send_time: '05:00 PM',
  };
}

function normalizeStockAlerts(raw = {}) {
  const defaults = defaultStockAlerts();
  const entries = Array.isArray(raw.selected_entries)
    ? raw.selected_entries
      .map(e => ({
        name: String(e?.name || '').trim(),
        reorderPoint: Math.max(0, Number(e?.reorderPoint ?? e?.reorder_point ?? 5) || 0),
      }))
      .filter(e => e.name)
    : [];
  const category = raw.category === 'item' ? 'item' : 'group';
  const frequency = ['immediate', 'daily', 'weekly'].includes(raw.frequency) ? raw.frequency : defaults.frequency;
  const expiry = EXPIRY_DAY_OPTIONS.includes(raw.expiry_days)
    ? raw.expiry_days
    : (typeof raw.expiry_days === 'number' ? `${raw.expiry_days} Days` : defaults.expiry_days);
  return {
    category,
    selected_entries: entries,
    include_negative: !!raw.include_negative,
    expiry_days: expiry,
    tracked_batches: raw.tracked_batches === undefined ? defaults.tracked_batches : !!raw.tracked_batches,
    group_by_warehouse: !!raw.group_by_warehouse,
    channels: normalizeChannels(raw.channels || defaults.channels),
    frequency,
    send_time: raw.send_time || defaults.send_time,
  };
}

export function SettingsStockAlerts() {
  const lt = useLabelT();
  const { selectedCompany } = useAuth();
  const guid = selectedCompany?.guid;
  const config = useRemoteConfig('/api/alert-settings', {
    stock_alerts: defaultStockAlerts(),
  }, {
    select: (response) => {
      const data = response?.data || {};
      return {
        ...data,
        stock_alerts: normalizeStockAlerts(data.stock_alerts),
      };
    },
    serialize: (value) => ({
      stock_alerts: normalizeStockAlerts(value.stock_alerts),
    }),
  });
  const stock = normalizeStockAlerts(config.value.stock_alerts);
  const setStock = (patch) => {
    config.setValue({
      ...config.value,
      stock_alerts: normalizeStockAlerts({ ...stock, ...patch }),
    });
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftNames, setDraftNames] = useState([]);
  const [options, setOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [search, setSearch] = useState('');

  const openPicker = async () => {
    setDraftNames(stock.selected_entries.map(e => e.name));
    setSearch('');
    setPickerOpen(true);
    if (!guid) {
      setOptions([]);
      return;
    }
    setOptionsLoading(true);
    try {
      if (stock.category === 'item') {
        const res = await api.fetchStocks({ companyGuid: guid, limit: 500, pageSize: 500 });
        const rows = res?.data?.stocks || [];
        setOptions(
          [...new Set(rows.map(r => String(typeof r === 'string' ? r : r?.name || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b)),
        );
      } else {
        const res = await api.fetchStockGroups(guid);
        const groups = res?.data || [];
        setOptions(
          [...new Set((Array.isArray(groups) ? groups : []).map(g => String(typeof g === 'string' ? g : g?.name || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b)),
        );
      }
    } catch {
      setOptions([]);
    } finally {
      setOptionsLoading(false);
    }
  };

  const filteredOptions = search.trim()
    ? options.filter(n => n.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  const updateReorder = (name, delta) => {
    setStock({
      selected_entries: stock.selected_entries.map(e => (
        e.name === name ? { ...e, reorderPoint: Math.max(0, e.reorderPoint + delta) } : e
      )),
    });
  };

  return (
    <Section
      title="Low Stock & Expiry Alerts"
      sub="Track groups or items with reorder points, expiry, and delivery schedule"
      testid="settings-stock-alerts"
      actions={<SaveAction config={config} testid="stock-alerts-save" />}
    >
      <ConfigState config={config}>
        <Card className="space-y-4 p-5" data-testid="stock-alerts-low-card">
          <p className="text-sm font-bold text-ink">{lt('Low Stock')}</p>
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink">{lt('Alert Category')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'group', label: 'Group wise' },
                { id: 'item', label: 'Item wise' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`stock-category-${opt.id}`}
                  onClick={() => setStock({ category: opt.id, selected_entries: [] })}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    stock.category === opt.id ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {lt(opt.label)}
                </button>
              ))}
            </div>
          </div>

          <Button className="w-full justify-between" data-testid="stock-alerts-select" onClick={openPicker}>
            <span>
              {stock.selected_entries.length === 0
                ? lt(stock.category === 'group' ? 'Select Groups' : 'Select Items')
                : lt(`${stock.selected_entries.length} ${stock.category === 'group' ? 'Group' : 'Item'}${stock.selected_entries.length === 1 ? '' : 's'} selected`)}
            </span>
            <ChevronDown size={14} />
          </Button>

          {stock.selected_entries.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line" data-testid="stock-alerts-entries">
              <div className="flex items-center justify-between bg-cream px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                <span>{lt(stock.category === 'group' ? 'Group' : 'Item')}</span>
                <span className="mr-10">{lt('Reorder Pt.')}</span>
              </div>
              {stock.selected_entries.map((entry, idx) => (
                <div key={entry.name} className={`flex items-center gap-2 px-3 py-2 ${idx ? 'border-t border-line' : ''}`}>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{entry.name}</span>
                  <div className="flex items-center rounded-lg border border-line bg-cream">
                    <button type="button" className="px-2 py-1 text-ink" onClick={() => updateReorder(entry.name, -1)} data-testid={`stock-reorder-dec-${idx}`}>−</button>
                    <span className="w-8 text-center text-[13px] font-bold tabular-nums">{entry.reorderPoint}</span>
                    <button type="button" className="px-2 py-1 text-ink" onClick={() => updateReorder(entry.name, 1)} data-testid={`stock-reorder-inc-${idx}`}>+</button>
                  </div>
                  <button
                    type="button"
                    aria-label={lt('Remove')}
                    className="rounded-lg border border-line p-1.5 text-ink-faint hover:text-ink"
                    onClick={() => setStock({ selected_entries: stock.selected_entries.filter(e => e.name !== entry.name) })}
                    data-testid={`stock-entry-remove-${idx}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <SettingRow title="Include Negative Stock">
            <Toggle checked={!!stock.include_negative} onChange={v => setStock({ include_negative: v })} testid="toggle-include-negative" />
          </SettingRow>
        </Card>

        <Card className="space-y-4 p-5" data-testid="stock-alerts-expiry-card">
          <p className="text-sm font-bold text-ink">{lt('Expiry Alerts')}</p>
          <Field label="Alert Before">
            <Select
              className="w-full max-w-xs"
              data-testid="stock-expiry-days"
              value={stock.expiry_days}
              onChange={e => setStock({ expiry_days: e.target.value })}
            >
              {EXPIRY_DAY_OPTIONS.map(o => <option key={o} value={o}>{lt(o)}</option>)}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'tracked_batches', label: 'Only track batches' },
              { key: 'group_by_warehouse', label: 'Group by warehouse' },
            ].map(opt => {
              const active = !!stock[opt.key];
              return (
                <button
                  key={opt.key}
                  type="button"
                  data-testid={`stock-${opt.key}`}
                  onClick={() => setStock({ [opt.key]: !active })}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    active ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {lt(opt.label)}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="space-y-4 p-5" data-testid="stock-alerts-delivery-card">
          <p className="text-sm font-bold text-ink">{lt('Delivery & Schedule')}</p>
          <ChannelChips value={stock.channels} onChange={channels => setStock({ channels })} testid="stock-channels" />
          <div>
            <p className="mb-2 text-[12px] font-semibold text-ink">{lt('Frequency')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'immediate', label: 'Immediate' },
                { id: 'daily', label: 'Daily' },
                { id: 'weekly', label: 'Weekly' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`stock-freq-${opt.id}`}
                  onClick={() => setStock({ frequency: opt.id })}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                    stock.frequency === opt.id ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink'
                  }`}
                >
                  {lt(opt.label)}
                </button>
              ))}
            </div>
          </div>
          {(stock.frequency === 'daily' || stock.frequency === 'weekly') && (
            <Field label="Send Time">
              <Input
                data-testid="stock-send-time"
                value={stock.send_time || ''}
                onChange={e => setStock({ send_time: e.target.value })}
                placeholder={lt('05:00 PM')}
              />
            </Field>
          )}
        </Card>
      </ConfigState>

      {pickerOpen && (
        <Modal
          open
          onClose={() => setPickerOpen(false)}
          title={lt(stock.category === 'group' ? 'Select Groups' : 'Select Items')}
          testid="stock-alerts-picker-modal"
          footer={(
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPickerOpen(false)}>{lt('Cancel')}</Button>
              <Button
                variant="primary"
                data-testid="stock-alerts-picker-done"
                onClick={() => {
                  const prev = new Map(stock.selected_entries.map(e => [e.name, e]));
                  setStock({
                    selected_entries: draftNames.map(name => prev.get(name) || { name, reorderPoint: 5 }),
                  });
                  setPickerOpen(false);
                }}
              >
                {lt('Done')}{draftNames.length ? ` (${draftNames.length})` : ''}
              </Button>
            </div>
          )}
        >
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-cream px-3 py-2">
            <Search size={14} className="text-ink-faint" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={lt(stock.category === 'group' ? 'Search groups…' : 'Search items…')}
              data-testid="stock-alerts-picker-search"
              className="h-8 w-full bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
            />
          </div>
          {optionsLoading ? (
            <p className="py-6 text-center text-[13px] text-ink-faint">{lt('Loading…')}</p>
          ) : filteredOptions.length === 0 ? (
            <Empty message={stock.category === 'group' ? 'No stock groups found' : 'No stock items found'} />
          ) : (
            <div className="max-h-[45vh] space-y-1 overflow-y-auto">
              {filteredOptions.map(name => {
                const checked = draftNames.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setDraftNames(prev => (checked ? prev.filter(n => n !== name) : [...prev, name]))}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${checked ? 'bg-cream font-semibold text-ink' : 'text-ink-soft hover:bg-cream'}`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${checked ? 'border-ink bg-ink text-white' : 'border-line-strong'}`}>
                      {checked && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}
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
  const integration = useRemoteConfig('/api/integration-settings', {
    einvoice: { provider: 'nic', gstin: '', username: '', password: '', client_id: '', client_secret: '' },
  }, {
    select: (response) => {
      const data = response?.data || {};
      const ei = data.einvoice || {};
      return {
        ...data,
        einvoice: {
          provider: ei.provider || 'nic',
          gstin: ei.gstin || '',
          username: ei.username || '',
          password: ei.password || '',
          client_id: ei.client_id || '',
          client_secret: ei.client_secret || '',
        },
      };
    },
    serialize: (value) => ({
      einvoice: {
        ...(value.einvoice || {}),
        connected: false,
      },
    }),
  });
  const creds = integration.value.einvoice || {};
  const setCreds = (patch) => integration.setValue({
    ...integration.value,
    einvoice: { ...creds, ...patch },
  });
  const applicable = compliance.value.e_invoice_applicable || 'not_applicable';
  return (
    <Section title="E-Invoice Settings" sub="IRN generation via your GSP" testid="settings-einvoice">
      <ConfigState config={compliance}>
      <Card className="space-y-3 p-5">
        <p className="text-sm font-bold text-ink">{lt('Applicability')}</p>
        {[
          { value: 'not_applicable', label: 'Not Applicable', sub: 'E-Invoice not required for this business' },
          { value: 'applicable_not_configured', label: 'Applicable — Not Configured', sub: 'Required but IRP credentials not set up yet' },
          { value: 'applicable_configured', label: 'Applicable — Configured', sub: 'IRP integrated, IRN generation enabled' },
        ].map(opt => (
          <button
            key={opt.value}
            type="button"
            data-testid={`einvoice-applicable-${opt.value}`}
            onClick={() => compliance.setValue({ ...compliance.value, e_invoice_applicable: opt.value })}
            className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left ${
              applicable === opt.value ? 'border-ink bg-cream' : 'border-line bg-paper hover:bg-cream'
            }`}
          >
            <span className="text-[13px] font-semibold text-ink">{lt(opt.label)}</span>
            <span className="text-[12px] text-ink-soft">{lt(opt.sub)}</span>
          </button>
        ))}
        {applicable === 'applicable_configured' && (
          <SettingRow title="Generation mode">
            <Select
              className="w-48"
              data-testid="toggle-einvoice"
              value={compliance.value.e_invoice_mode || 'manual'}
              onChange={e => compliance.setValue({ ...compliance.value, e_invoice_mode: e.target.value })}
            >
              <option value="manual">{lt('Manual')}</option>
              <option value="auto">{lt('Automatic')}</option>
            </Select>
          </SettingRow>
        )}
        <div className="flex justify-end"><SaveAction config={compliance} testid="einvoice-compliance-save" /></div>
      </Card>
      </ConfigState>
      <ConfigState config={integration}>
        <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="IRP Provider">
            <Select
              className="w-full"
              data-testid="einvoice-provider"
              value={creds.provider || 'nic'}
              onChange={e => setCreds({ provider: e.target.value })}
            >
              {EINVOICE_PROVIDERS.map(p => <option key={p.value} value={p.value}>{lt(p.label)}</option>)}
            </Select>
          </Field>
          <Field label="GSTIN">
            <Input
              data-testid="einvoice-gstin"
              value={creds.gstin || ''}
              onChange={e => setCreds({ gstin: e.target.value.toUpperCase() })}
              placeholder={lt('15-digit GSTIN')}
            />
          </Field>
          <Field label="API username">
            <Input
              value={creds.username || ''}
              onChange={e => setCreds({ username: e.target.value })}
              placeholder={lt('Portal username')}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              data-testid="einvoice-password"
              value={creds.password || ''}
              onChange={e => setCreds({ password: e.target.value })}
              placeholder={lt('Portal password')}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Client ID">
            <Input
              data-testid="gsp-select"
              value={creds.client_id || ''}
              onChange={e => setCreds({ client_id: e.target.value })}
              placeholder={lt('API Client ID')}
            />
          </Field>
          <Field label="Client secret">
            <Input
              type="password"
              value={creds.client_secret || ''}
              onChange={e => setCreds({ client_secret: e.target.value })}
              placeholder={lt('API Client Secret')}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex justify-end sm:col-span-2"><SaveAction config={integration} testid="einvoice-credentials-save" /></div>
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
  const integration = useRemoteConfig('/api/integration-settings', {
    ewb: { gsp: 'nic', gstin: '', username: '', password: '', client_id: '', client_secret: '' },
  }, {
    select: (response) => {
      const data = response?.data || {};
      const ewb = data.ewb || data.ewaybill || {};
      return {
        ...data,
        ewb: {
          gsp: ewb.gsp || ewb.provider || 'nic',
          gstin: ewb.gstin || '',
          username: ewb.username || '',
          password: ewb.password || '',
          client_id: ewb.client_id || '',
          client_secret: ewb.client_secret || '',
        },
      };
    },
    serialize: (value) => ({
      ewb: {
        ...(value.ewb || {}),
        connected: false,
      },
    }),
  });
  const creds = integration.value.ewb || {};
  const setCreds = (patch) => integration.setValue({
    ...integration.value,
    ewb: { ...creds, ...patch },
  });
  const applicable = compliance.value.e_way_bill_applicable || 'not_applicable';
  return (
    <Section title="E-Way Bill Settings" sub="Consignment rules and transporter defaults" testid="settings-ewb">
      <ConfigState config={compliance}>
      <Card className="space-y-3 p-5">
        <p className="text-sm font-bold text-ink">{lt('Applicability')}</p>
        {[
          { value: 'not_applicable', label: 'Not Applicable', sub: 'No goods movement or below threshold' },
          { value: 'applicable_not_configured', label: 'Applicable — Not Configured', sub: 'Required but NIC EWB credentials not set up yet' },
          { value: 'applicable_configured', label: 'Applicable — Configured', sub: 'EWB portal integrated, generation enabled' },
        ].map(opt => (
          <button
            key={opt.value}
            type="button"
            data-testid={`ewb-applicable-${opt.value}`}
            onClick={() => compliance.setValue({ ...compliance.value, e_way_bill_applicable: opt.value })}
            className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left ${
              applicable === opt.value ? 'border-ink bg-cream' : 'border-line bg-paper hover:bg-cream'
            }`}
          >
            <span className="text-[13px] font-semibold text-ink">{lt(opt.label)}</span>
            <span className="text-[12px] text-ink-soft">{lt(opt.sub)}</span>
          </button>
        ))}
        {applicable === 'applicable_configured' && (
          <SettingRow title="Generation mode">
            <Select
              className="w-56"
              data-testid="toggle-ewb"
              value={compliance.value.e_way_bill_mode || 'manual'}
              onChange={e => compliance.setValue({ ...compliance.value, e_way_bill_mode: e.target.value })}
            >
              <option value="manual">{lt('Manual')}</option>
              <option value="auto">{lt('Auto when details ready')}</option>
              <option value="ask_after_irn">{lt('Ask after IRN')}</option>
            </Select>
          </SettingRow>
        )}
        <div className="flex justify-end"><SaveAction config={compliance} testid="ewb-compliance-save" /></div>
      </Card>
      </ConfigState>
      <ConfigState config={integration}>
        <Card className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Field label="GSP Provider">
            <Select
              className="w-full"
              data-testid="ewb-gsp"
              value={creds.gsp || 'nic'}
              onChange={e => setCreds({ gsp: e.target.value })}
            >
              {EWB_GSP_OPTIONS.map(p => <option key={p.value} value={p.value}>{lt(p.label)}</option>)}
            </Select>
          </Field>
          <Field label="GSTIN">
            <Input
              data-testid="ewb-gstin"
              value={creds.gstin || ''}
              onChange={e => setCreds({ gstin: e.target.value.toUpperCase() })}
              placeholder={lt('15-digit GSTIN')}
            />
          </Field>
          <Field label="API username">
            <Input
              value={creds.username || ''}
              onChange={e => setCreds({ username: e.target.value })}
              placeholder={lt('Portal username')}
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              data-testid="ewb-password"
              value={creds.password || ''}
              onChange={e => setCreds({ password: e.target.value })}
              placeholder={lt('Portal password')}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Client ID">
            <Input
              value={creds.client_id || ''}
              onChange={e => setCreds({ client_id: e.target.value })}
              placeholder={lt('API Client ID')}
            />
          </Field>
          <Field label="Client secret">
            <Input
              type="password"
              value={creds.client_secret || ''}
              onChange={e => setCreds({ client_secret: e.target.value })}
              placeholder={lt('API Client Secret')}
              autoComplete="new-password"
            />
          </Field>
          <div className="flex justify-end sm:col-span-2"><SaveAction config={integration} testid="ewb-credentials-save" /></div>
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
