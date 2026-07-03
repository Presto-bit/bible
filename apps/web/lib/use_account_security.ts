'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bindPhone,
  changePassword,
  effectiveId,
  getUserName,
  hasPassword,
  listDevices,
  setCredentials,
  usernameAvailable,
  type BoundDevice,
} from '@/lib/api';
import { usePasswordSheet } from '@/components/ui/PasswordSheetProvider';

export function maskPhone(phone: string): string {
  const p = phone.trim();
  if (p.length < 7) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

export function useAccountSecurity(onAccountChange?: () => void) {
  const askPassword = usePasswordSheet();
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [phone, setPhone] = useState('');
  const [phonePwd, setPhonePwd] = useState('');
  const [phoneStored, setPhoneStored] = useState<string | null>(null);
  const [devices, setDevices] = useState<BoundDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [idCopied, setIdCopied] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const id = effectiveId();

  const load = useCallback(async () => {
    try {
      const d = await listDevices();
      setDevices(d);
    } catch {
      setDevices([]);
    }
    const storedPhone = localStorage.getItem('account_phone');
    setPhoneStored(storedPhone || null);
  }, []);

  useEffect(() => {
    setName(getUserName());
    void load();
  }, [load]);

  const notify = () => onAccountChange?.();

  const bindPhoneIfNeeded = async (passwordForPhone: string | null) => {
    const p = phone.trim();
    if (!p || phoneStored) return;
    const bound = await bindPhone(p, passwordForPhone);
    setPhoneStored(bound);
    setPhone('');
    setPhonePwd('');
  };

  const saveUsername = async (requirePassword: boolean) => {
    const u = name.trim();
    if (u.length < 2) {
      setMsg('用户名至少 2 个字');
      return false;
    }
    if (requirePassword && pwd.length < 6) {
      setMsg('密码至少 6 位');
      return false;
    }
    if (!requirePassword && pwd.length > 0 && pwd.length < 6) {
      setMsg('密码至少 6 位');
      return false;
    }
    setBusy(true);
    setMsg(null);
    try {
      const prev = getUserName();
      if (u !== prev) {
        const ok = await usernameAvailable(u);
        if (!ok) {
          setMsg('用户名已被占用');
          return false;
        }
      }
      await setCredentials(u, pwd.length >= 6 ? pwd : '');
      if (phone.trim()) {
        await bindPhoneIfNeeded(pwd.length >= 6 ? pwd : phonePwd || null);
      }
      setMsg(phone.trim() ? '已保存' : '用户名已保存');
      setPwd('');
      notify();
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const bindPhoneHandler = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await bindPhoneIfNeeded(phonePwd || null);
      setMsg('手机号已绑定');
      notify();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const changePasswordHandler = async () => {
    const needOld = hasPassword();
    const ok = await askPassword({
      title: needOld ? '修改密码' : '设置密码',
      needCurrent: needOld,
      onSubmit: async (old, next) => {
        await changePassword(old, next);
        setMsg('密码已更新');
        notify();
      },
    });
    if (!ok) return;
  };

  const copyId = async () => {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return {
    name,
    setName,
    pwd,
    setPwd,
    phone,
    setPhone,
    phonePwd,
    setPhonePwd,
    phoneStored,
    devices,
    busy,
    msg,
    idCopied,
    showAdvanced,
    setShowAdvanced,
    id,
    load,
    saveUsername,
    bindPhoneHandler,
    changePasswordHandler,
    copyId,
  };
}
