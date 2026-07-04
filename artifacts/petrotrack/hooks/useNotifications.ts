import { useEffect, useRef } from 'react';

import { useApp, type Role } from '@/context/AppContext';

interface NotificationDef {
  id: string;
  delayMs: number;
  roles: Role[];
  from: Role;
  check: (ctx: ReturnType<typeof useApp>) => boolean;
  build: (ctx: ReturnType<typeof useApp>) => {
    type: 'txt' | 'alert' | 'req';
    body: string;
    from: Role;
    to: Role;
    alrt?: { title: string; pri: string; detail: string };
    req?: { product: string; qty: number; sup: string; reason: string };
  };
}

const NOTIFICATIONS: NotificationDef[] = [
  {
    id: 'dip-reminder',
    delayMs: 5000,
    roles: ['mgr', 'att'],
    from: 'admin',
    check: ({ dips }) => {
      const today = new Date().toISOString().slice(0, 10);
      return !dips.find(d => d.dt.startsWith(today));
    },
    build: ({ role }) => ({
      type: 'alert',
      from: 'admin',
      to: role!,
      body: 'Daily dip reminder',
      alrt: {
        title: '⏰ Morning Dip Not Yet Submitted',
        pri: 'Urgent',
        detail: 'No tank dip has been recorded today. Per SOPs, all tanks must be dipped between 05:30–06:30 AM. Please submit readings now.',
      },
    }),
  },
  {
    id: 'licence-expiry',
    delayMs: 7000,
    roles: ['csm', 'ceo', 'md'],
    from: 'admin',
    check: ({ docs }) => {
      return docs.some(d => {
        const days = Math.ceil((new Date(d.exp).getTime() - Date.now()) / 86400000);
        return days >= 0 && days <= 14;
      });
    },
    build: ({ docs, role }) => {
      const urgent = docs.filter(d => {
        const days = Math.ceil((new Date(d.exp).getTime() - Date.now()) / 86400000);
        return days >= 0 && days <= 14;
      });
      const names = urgent.map(d => d.name).join(', ');
      return {
        type: 'alert',
        from: 'admin',
        to: role!,
        body: 'Licence expiry alert',
        alrt: {
          title: `📄 ${urgent.length} Compliance Document${urgent.length > 1 ? 's' : ''} Expiring Soon`,
          pri: 'Urgent',
          detail: `${names} — renewal required within 14 days. Log in to the relevant agency portals (NMDPRA, NESREA, FSCE) to initiate renewals.`,
        },
      };
    },
  },
  {
    id: 'pending-expenses',
    delayMs: 10000,
    roles: ['acc', 'ceo', 'md'],
    from: 'mgr',
    check: ({ expenses }) => expenses.some(e => e.status === 'pending'),
    build: ({ expenses, role }) => {
      const pending = expenses.filter(e => e.status === 'pending');
      const total = pending.reduce((s, e) => s + e.amt, 0);
      return {
        type: 'req',
        from: 'mgr',
        to: role!,
        body: 'Expense approval request',
        req: {
          product: 'Expense Batch',
          qty: pending.length,
          sup: 'Station Operations',
          reason: `${pending.length} expense${pending.length > 1 ? 's' : ''} totalling ₦${total.toLocaleString()} are awaiting your approval. Categories: ${[...new Set(pending.map(e => e.cat))].join(', ')}.`,
        },
      };
    },
  },
  {
    id: 'budget-pending',
    delayMs: 14000,
    roles: ['ceo', 'md', 'acc'],
    from: 'mgr',
    check: ({ budgets }) =>
      budgets.some(b => b.status === 'acc_forwarded' || b.status === 'submitted'),
    build: ({ budgets, role }) => {
      const pending = budgets.filter(b => b.status === 'acc_forwarded' || b.status === 'submitted');
      const b = pending[0];
      return {
        type: 'req',
        from: 'mgr',
        to: role!,
        body: 'Budget approval required',
        req: {
          product: `${b.label} Budget`,
          qty: Math.round(b.total / 1000),
          sup: `₦${b.total.toLocaleString()} total`,
          reason: `${b.label} operating budget is awaiting your approval. ${pending.length > 1 ? `+${pending.length - 1} other budget(s) also pending.` : ''}`,
        },
      };
    },
  },
  {
    id: 'low-stock',
    delayMs: 18000,
    roles: ['mgr', 'ceo', 'md', 'acc'],
    from: 'admin',
    check: ({ tanks }) =>
      tanks.some(t => {
        const stock = t.op + t.rv - t.sl;
        return (stock / t.cap) < 0.30;
      }),
    build: ({ tanks, role }) => {
      const low = tanks.filter(t => {
        const stock = t.op + t.rv - t.sl;
        return (stock / t.cap) < 0.30;
      });
      const names = low.map(t => `${t.name} (${Math.round(((t.op + t.rv - t.sl) / t.cap) * 100)}%)`).join(', ');
      return {
        type: 'alert',
        from: 'admin',
        to: role!,
        body: 'Low stock alert',
        alrt: {
          title: `🛢️ Low Stock: ${low.length} Tank${low.length > 1 ? 's' : ''} Below 30%`,
          pri: 'Urgent',
          detail: `${names}. Initiate a purchase order immediately to avoid stock-out. Contact NNPCL or alternate supplier.`,
        },
      };
    },
  },
  {
    id: 'price-sync',
    delayMs: 22000,
    roles: ['md', 'mktg', 'ceo'],
    from: 'mktg',
    check: () => true,
    build: ({ role }) => ({
      type: 'txt',
      from: 'mktg',
      to: role!,
      body: '📊 Weekly competitor price report ready. NNPCL Retail dropped PMS to ₦817/L. Our price at ₦830/L is 1.6% above market average. Recommend reviewing pump price to stay competitive.',
    }),
  },
  {
    id: 'maintenance-open',
    delayMs: 26000,
    roles: ['mgr', 'csm', 'md'],
    from: 'att',
    check: ({ maintenance }) => maintenance.some(m => m.st === 'Open' && m.pri === 'Urgent'),
    build: ({ maintenance, role }) => {
      const urgent = maintenance.filter(m => m.st === 'Open' && m.pri === 'Urgent');
      return {
        type: 'alert',
        from: 'att',
        to: role!,
        body: 'Maintenance escalation',
        alrt: {
          title: `🔧 ${urgent.length} Urgent Maintenance Item${urgent.length > 1 ? 's' : ''} Unresolved`,
          pri: 'Urgent',
          detail: urgent.map(m => m.title).join(' | ') + ' — no action taken in 72+ hours. Escalating per maintenance SOP.',
        },
      };
    },
  },
  {
    id: 'delivery-anomaly',
    delayMs: 32000,
    roles: ['mgr', 'ceo', 'md', 'acc'],
    from: 'admin',
    check: ({ deliveries }) => deliveries.some(d => d.st === 'short'),
    build: ({ deliveries, role }) => {
      const short = deliveries.filter(d => d.st === 'short');
      const d = short[0];
      const diff = d.ord - d.rec;
      return {
        type: 'alert',
        from: 'admin',
        to: role!,
        body: 'Short delivery alert',
        alrt: {
          title: `⚠️ Short Delivery Dispute — ${d.prod}`,
          pri: 'Medium',
          detail: `WB ${d.wb}: ${diff.toLocaleString()}L shortage from ${d.sup}. Ordered ${d.ord.toLocaleString()}L, received ${d.rec.toLocaleString()}L. Formal dispute should be raised with supplier within 48 hours.`,
        },
      };
    },
  },
];

export function useNotifications() {
  const ctx = useApp();
  const { role } = ctx;
  const sentRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!role) {
      sentRef.current.clear();
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      return;
    }

    const applicable = NOTIFICATIONS.filter(n => n.roles.includes(role));

    applicable.forEach(n => {
      const key = `${role}-${n.id}`;
      if (sentRef.current.has(key)) return;

      const timer = setTimeout(() => {
        try {
          if (!n.check(ctx)) return;
          const msg = n.build(ctx);
          ctx.addSystemNotification(n.from, msg as any);
          sentRef.current.add(key);
        } catch {
        }
      }, n.delayMs);

      timersRef.current.push(timer);
    });

    return () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [role]);
}
