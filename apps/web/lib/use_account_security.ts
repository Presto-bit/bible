'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bindPhone,
  changePassword,
  effectiveId,
  getBoundPhone,
  getUserName,
  hasPassword,
  listDevices,
  setCredentials,
  type BoundDevice,
} from '@/lib/api';
import { usePasswordSheet } from '@/components/ui/PasswordSheetProvider';

export function maskPhone(phone: string): string {
  const p = phone.trim();
  if (p.length < 7) return p;
  return `${p.slice(0, 3)}****${p.slice(-4)}`;
}

/**
 * 账号与安全：只管密码 / 手机 / 设备 / ID。
 * 展示称呼请走「我的」Hero，勿在此混入。
 */
export function useAccountSecurity(onAccountChange?: () => void) {
  const askPassword = usePasswordSheet();
  const [pwd, setPwd] = useState('');
  const [phone, setPhone] = useState('');
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
    const storedPhone = getBoundPhone().trim();
    setPhoneStored(storedPhone || null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const notify = () => onAccountChange?.();

  /** 已登录会话内绑手机：不再强制再输密码 */
  const bindPhoneIfNeeded = async () => {
    const p = phone.trim();
    if (!p || phoneStored) return;
    const bound = await bindPhone(p, null);
    setPhoneStored(bound);
    setPhone('');
  };

  /** 首次设密（可顺带绑手机）；称呼沿用已有或稍后在 Hero 设置 */
  const savePassword = async (): Promise<boolean> => {
    if (pwd.length < 6) {
      setMsg('密码至少 6 位');
      return false;
    }
    setBusy(true);
    setMsg(null);
    try {
      const existingName = getUserName().trim();
      await setCredentials(existingName, pwd);
      if (phone.trim()) {
        await bindPhoneIfNeeded();
      }
      setMsg(phone.trim() ? '密码已保存，手机已绑定' : '密码已保存');
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
    if (!phone.trim()) {
      setMsg('请输入手机号');
      return;
    }
    if (!hasPassword()) {
      setMsg('请先设置密码，再绑定手机');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await bindPhoneIfNeeded();
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
    pwd,
    setPwd,
    phone,
    setPhone,
    phoneStored,
    devices,
    busy,
    msg,
    setMsg,
    idCopied,
    showAdvanced,
    setShowAdvanced,
    id,
    load,
    savePassword,
    bindPhoneHandler,
    changePasswordHandler,
    copyId,
  };
}
