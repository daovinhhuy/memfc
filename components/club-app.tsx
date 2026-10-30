"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  History,
  Link2,
  LoaderCircle,
  LogIn,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Shuffle,
  Trophy,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  balanceTeams,
  cashBalance,
  day,
  initials,
  money,
  monthKey,
  monthlySummary,
  settlementPlan,
  time,
} from "@/lib/domain";
import * as repo from "@/lib/repository";
import {
  LEVELS,
  MAX_LEVEL,
  positions,
  type ClubData,
  type Match,
  type MatchInput,
  type Position,
  type Profile,
  type SettlementInput,
  type VoteStatus,
} from "@/lib/types";

type Tab = "attendance" | "teams" | "fund" | "members";
const navigation = [
  { id: "attendance", label: "Điểm danh", icon: CheckCircle2 },
  { id: "teams", label: "Chia đội", icon: Shuffle },
  { id: "fund", label: "Quỹ đội bóng", icon: Wallet },
  { id: "members", label: "Thành viên", icon: Users },
] as const;
const statusText = { yes: "Có tham gia", no: "Không tham gia" };
const localInput = (iso: string) =>
  new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 16);
const isoInput = (value: string) => new Date(`${value}:00+07:00`).toISOString();
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Có lỗi xảy ra. Vui lòng thử lại.";

function Crest({ small = false }: { small?: boolean }) {
  return (
    <div className={`crest ${small ? "small" : ""}`} aria-hidden="true">
      <ShieldCheck size={small ? 23 : 31} strokeWidth={1.5} />
      <span>M</span>
    </div>
  );
}
function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return <span className={`avatar tone-${index % 5}`}>{initials(name)}</span>;
}
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <CircleDot size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    label = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, textarea, a[href], [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={label}
      >
        <div className="modal-heading">
          <h2 id={label}>{title}</h2>
          <button className="icon-button" aria-label="Đóng" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ClubApp() {
  const [tab, setTab] = useState<Tab>("attendance"),
    [data, setData] = useState<ClubData | null>(null);
  const [demo, setDemo] = useState(!supabase),
    [ready, setReady] = useState(false),
    [admin, setAdmin] = useState(false);
  const [selectedId, setSelectedId] = useState(""),
    [memberId, setMemberId] = useState("");
  const [month, setMonth] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [matchForm, setMatchForm] = useState<Match | "new" | null>(null),
    [memberForm, setMemberForm] = useState<Profile | "new" | null>(null);
  const [loginOpen, setLoginOpen] = useState(false),
    [transactionOpen, setTransactionOpen] = useState(false);
  const [settlementMatch, setSettlementMatch] = useState<Match | null>(null);
  const [lineupMatchId, setLineupMatchId] = useState<string | null>(null);
  const [swapPlayersOpen, setSwapPlayersOpen] = useState(false);
  const [swapPlayerA, setSwapPlayerA] = useState("");
  const [swapPlayerB, setSwapPlayerB] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    body: string;
    action: () => Promise<void>;
  } | null>(null);
  const requestId = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMemberId(localStorage.getItem("memfc-selected-name") || "");
    setSelectedId(new URLSearchParams(location.search).get("match") || "");
    setMonth(monthKey(new Date().toISOString()));
    setNow(Date.now());
    setReady(true);
  }, []);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const result = await repo.loadData(demo);
    if (id === requestId.current) {
      setData(result);
      setNow(Date.now());
      setError("");
    }
  }, [demo]);
  useEffect(() => {
    if (!ready) return;
    refresh().catch((e) => setError(messageOf(e)));
    const timer = setInterval(() => {
      if (!document.hidden) refresh().catch((e) => setError(messageOf(e)));
    }, 30000);
    const focus = () => {
      refresh().catch((e) => setError(messageOf(e)));
    };
    window.addEventListener("focus", focus);
    window.addEventListener("storage", focus);
    return () => {
      clearInterval(timer);
      ++requestId.current;
      window.removeEventListener("focus", focus);
      window.removeEventListener("storage", focus);
    };
  }, [refresh, ready]);
  useEffect(() => {
    const nextStart = data?.sessions
      .map((match) => new Date(match.starts_at).getTime())
      .filter((startsAt) => startsAt > now)
      .sort((a, b) => a - b)[0];
    if (nextStart === undefined) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(2147483647, Math.max(0, nextStart - Date.now() + 1)),
    );
    return () => clearTimeout(timer);
  }, [data, now]);
  useEffect(() => {
    if (demo) {
      setAdmin(true);
      return;
    }
    if (!supabase) return;
    let live = true;
    async function check() {
      const { data, error } = await supabase!.rpc("is_admin");
      if (live) {
        setAdmin(!error && data === true);
        refresh().catch((e) => setError(messageOf(e)));
      }
    }
    check();
    const { data: auth } = supabase.auth.onAuthStateChange(() => {
      setTimeout(check, 0);
    });
    return () => {
      live = false;
      auth.subscription.unsubscribe();
    };
  }, [demo, refresh]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(id);
  }, [notice]);

  async function perform<T>(
    action: () => Promise<T>,
    message: string,
    onSuccess?: (result: T) => void,
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await action();
      onSuccess?.(result);
      setNotice(message);
      await refresh();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  function selectMatch(id: string) {
    setNow(Date.now());
    setSelectedId(id);
    const url = new URL(location.href);
    url.searchParams.set("match", id);
    history.replaceState(null, "", url);
  }
  function selectMatchFilter(value: string) {
    setNow(Date.now());
    setFilter(value);
    setSelectedId("");
    const url = new URL(location.href);
    url.searchParams.delete("match");
    history.replaceState(null, "", url);
  }
  function chooseMember(id: string) {
    setMemberId(id);
    localStorage.setItem("memfc-selected-name", id);
  }
  async function share(match: Match) {
    const url = new URL(location.href);
    url.searchParams.set("match", match.id);
    try {
      await navigator.clipboard.writeText(
        `${match.title}\n${day(match.starts_at, { weekday: "long", year: "numeric" })} · ${time(match.starts_at)}\n${match.venue} · ${match.address}\nChọn tên và xác nhận tham gia: ${url}`,
      );
      setNotice("Đã sao chép lịch đá và link bình chọn.");
    } catch {
      setError(
        "Chưa sao chép được. Bạn có thể sao chép đường dẫn trên thanh địa chỉ.",
      );
    }
  }

  const sessions = [...(data?.sessions || [])].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at),
  );
  const upcoming = sessions.filter(
    (s) => !s.finalized_at && new Date(s.starts_at).getTime() > now,
  );
  const nextMatch = upcoming[0];
  const lineupMatch = sessions.find((s) => s.id === lineupMatchId);
  const selected =
    sessions.find((s) => s.id === selectedId) ||
    (tab === "teams"
      ? nextMatch ||
        [...sessions].reverse().find((s) => !s.finalized_at) ||
        sessions.at(-1)
      : undefined);
  const profiles = data?.profiles || [],
    activeMembers = profiles.filter((p) => p.active);
  const votes = (data?.votes || []).filter(
    (v) => v.session_id === selected?.id,
  );
  const yes = votes.filter((v) => v.status === "yes"),
    no = votes.filter((v) => v.status === "no");
  const roster = selected
    ? selected.roster_ids
        .map((id) => profiles.find((p) => p.id === id))
        .filter((p): p is Profile => !!p)
    : [];
  const currentVote = votes.find((v) => v.user_id === memberId);
  const chosen = roster.find((p) => p.id === memberId);
  const summary = data && month ? monthlySummary(data, month) : null;
  const monthSessions = sessions.filter((s) => monthKey(s.starts_at) === month);
  const heading = navigation.find((n) => n.id === tab)!;

  useEffect(() => {
    if (tab === "attendance" && selectedId && selected?.id) {
      document.getElementById("registration-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [tab, selectedId, selected?.id]);
  const closeMatch = useCallback(() => setMatchForm(null), []),
    closeMember = useCallback(() => setMemberForm(null), []),
    closeLogin = useCallback(() => setLoginOpen(false), []),
    closeTransaction = useCallback(() => setTransactionOpen(false), []),
    closeLineup = useCallback(() => setLineupMatchId(null), []),
    closeSwapPlayers = useCallback(() => setSwapPlayersOpen(false), []),
    closeSettlement = useCallback(() => setSettlementMatch(null), []),
    closeConfirm = useCallback(() => setConfirmation(null), []);

  function renderMatchList() {
    let list = sessions.filter(
      (s) =>
        filter === "all" ||
        (filter === "past"
          ? !!s.finalized_at || new Date(s.starts_at).getTime() <= now
          : !s.finalized_at && new Date(s.starts_at).getTime() > now),
    );
    if (search)
      list = list.filter((s) =>
        `${s.title} ${s.venue}`
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi")),
      );
    if (filter !== "upcoming") list = [...list].reverse();
    return list.length ? (
      <div className="match-list">
        {list.map((m) => {
          const mv = data!.votes.filter((v) => v.session_id === m.id),
            count = mv.filter((v) => v.status === "yes").length;
          return (
            <button
              key={m.id}
              onClick={() => selectMatch(m.id)}
              aria-pressed={m.id === selectedId}
              className={`match-card ${m.id === selected?.id ? "selected" : ""}`}
            >
              <span className="date-tile">
                <strong>{day(m.starts_at, { month: undefined })}</strong>
                <span>
                  THÁNG {day(m.starts_at, { day: undefined, month: "numeric" })}
                </span>
              </span>
              <span className="match-card-main">
                <span className="row-between">
                  <strong>{m.title}</strong>
                  <span
                    className={`tag ${m.finalized_at || new Date(m.starts_at).getTime() <= now ? "match-past" : "match-upcoming"}`}
                  >
                    {m.finalized_at
                      ? "Đã chốt"
                      : new Date(m.starts_at).getTime() <= now
                        ? "Đã diễn ra"
                        : m.voting_locked_at
                          ? "Đã khóa bình chọn"
                          : "Sắp diễn ra"}
                  </span>
                </span>
                <span className="meta">
                  <span>
                    <Clock3 size={13} />
                    {time(m.starts_at)} · {m.duration} phút
                  </span>
                  <span>
                    <MapPin size={13} />
                    {m.venue}
                  </span>
                </span>
                <span className="match-bottom">
                  <span className="mini-avatars">
                    {data!.profiles
                      .filter((p) =>
                        mv.some(
                          (v) => v.user_id === p.id && v.status === "yes",
                        ),
                      )
                      .slice(0, 3)
                      .map((p, i) => (
                        <Avatar key={p.id} name={p.full_name} index={i} />
                      ))}
                  </span>
                  <span>
                    <b>{count}</b> người có đá{" "}
                    <span className="separator">·</span> {mv.length}/
                    {m.roster_ids.length} đã trả lời
                  </span>
                </span>
              </span>
              <ChevronRight size={17} className="card-chevron" />
            </button>
          );
        })}
      </div>
    ) : (
      <Empty
        title={search ? "Không tìm thấy lịch phù hợp" : "Chưa có lịch đá"}
        detail={
          admin
            ? "Tạo một buổi đá, rồi gửi link cho cả đội nhé."
            : "Lịch mới sẽ xuất hiện khi quản trị viên tạo trận."
        }
      />
    );
  }

  function renderRegistration() {
    if (!selected)
      return (
        <section className="panel registration">
          <Empty
            title="Hẹn nhau ở trận tới"
            detail="Chọn một lịch đá để xem và xác nhận tham gia."
          />
        </section>
      );
    const history = [...(data?.vote_history || [])]
      .filter((h) => h.session_id === selected.id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return (
      <section className="panel registration" id="registration-section">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">BÌNH CHỌN THAM GIA</span>
            <h2>
              {day(selected.starts_at, { weekday: "long" })} ·{" "}
              {time(selected.starts_at)}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={() => share(selected)}
            aria-label="Sao chép link bình chọn"
          >
            <Link2 size={18} />
          </button>
        </div>
        <p className="registration-title">{selected.title}</p>
        <a
          className="venue-link"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selected.venue} ${selected.address}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={16} />
          <span>
            {selected.venue}
            <small>{selected.address || "Xem vị trí trên bản đồ"}</small>
          </span>
          <ArrowUpRight size={16} />
        </a>
        {selected.notes && <p className="match-note">{selected.notes}</p>}
        <div className="poll-count">
          <strong>
            {votes.length}
            <span>/{roster.length}</span>
          </strong>
          <span>thành viên đã trả lời</span>
          <b>
            {roster.length
              ? Math.round((votes.length / roster.length) * 100)
              : 0}
            %
          </b>
        </div>
        <div className="progress">
          <span
            style={{
              width: `${roster.length ? (yes.length / roster.length) * 100 : 0}%`,
            }}
          />
          <span
            className="declined"
            style={{
              width: `${roster.length ? (no.length / roster.length) * 100 : 0}%`,
            }}
          />
        </div>
        <div className="poll-legend">
          <span>
            <i />
            {yes.length} có đá
          </span>
          <span>
            <i className="red" />
            {no.length} không đá
          </span>
          <span>
            <i className="gray" />
            {Math.max(0, roster.length - votes.length)} chưa trả lời
          </span>
        </div>
        {selected.finalized_at ||
        selected.voting_locked_at ||
        new Date(selected.starts_at).getTime() <= now ? (
          <div className="locked-note">
            <ShieldCheck size={19} />
            <span>
              {selected.finalized_at ? (
                <>
                  Danh sách đã chốt {day(selected.finalized_at)}. Bình chọn và
                  khoản quỹ đã được lưu.
                </>
              ) : new Date(selected.starts_at).getTime() <= now ? (
                <>
                  Trận đã diễn ra. Chỉ xem thông tin đăng ký; không thể bình
                  chọn hoặc đổi lựa chọn.
                </>
              ) : (
                <>
                  Bình chọn đã khóa. Danh sách đăng ký được giữ nguyên; hiện
                  không thể đăng ký hoặc đổi lựa chọn.
                </>
              )}
            </span>
          </div>
        ) : (
          <div className="vote-form" id="vote-form">
            <label htmlFor="member-choice">Bạn là ai?</label>
            <select
              id="member-choice"
              value={chosen ? memberId : ""}
              onChange={(e) => chooseMember(e.target.value)}
            >
              <option value="">Chọn đúng tên của bạn</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <div className="vote-buttons">
              <button
                className={`button ${currentVote?.status === "yes" ? "primary" : "vote-yes"}`}
                disabled={!chosen || busy}
                onClick={() =>
                  perform(
                    () => repo.castVote(demo, selected.id, memberId, "yes"),
                    `Đã ghi nhận ${chosen!.full_name}: có tham gia.`,
                  )
                }
              >
                <Check size={17} />
                Có tham gia
              </button>
              <button
                className={`button ${currentVote?.status === "no" ? "vote-no active" : "vote-no"}`}
                disabled={!chosen || busy}
                onClick={() =>
                  perform(
                    () => repo.castVote(demo, selected.id, memberId, "no"),
                    `Đã ghi nhận ${chosen!.full_name}: không tham gia.`,
                  )
                }
              >
                <X size={17} />
                Không tham gia
              </button>
            </div>
            <p className="hint">
              {currentVote
                ? `Đã lưu: ${statusText[currentVote.status]}. Bạn có thể đổi khi bình chọn còn mở.`
                : "Chỉ cần chọn tên và xác nhận. Không cần đăng nhập."}
            </p>
          </div>
        )}
        <details className="roster-details" open>
          <summary>
            Danh sách buổi đá <span>{roster.length} thành viên</span>
          </summary>
          <div className="poll-roster">
            {roster.map((p, i) => {
              const v = votes.find((v) => v.user_id === p.id);
              return (
                <div className="poll-person" key={p.id}>
                  <Avatar name={p.full_name} index={i} />
                  <span>
                    {p.full_name}
                    <small>{positions[p.position]}</small>
                  </span>
                  <span className={`person-status ${v?.status || "pending"}`}>
                    {v?.status === "yes" ? (
                      <Check size={14} />
                    ) : v?.status === "no" ? (
                      <X size={14} />
                    ) : (
                      <Clock3 size={13} />
                    )}
                    {v
                      ? v.status === "yes"
                        ? "Có đá"
                        : "Không đá"
                      : "Chưa trả lời"}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
        <details className="history-details">
          <summary>
            <History size={15} />
            Lịch sử bình chọn <span>{history.length}</span>
          </summary>
          <div className="history-list">
            {history.length ? (
              history.map((h) => (
                <p key={h.id}>
                  <strong>
                    {profiles.find((p) => p.id === h.user_id)?.full_name ||
                      "Thành viên"}
                  </strong>
                  <span
                    className={h.status === "yes" ? "text-green" : "text-red"}
                  >
                    {statusText[h.status]}
                  </span>
                  <small>
                    {day(h.updated_at)} · {time(h.updated_at)}
                  </small>
                </p>
              ))
            ) : (
              <p className="hint">Chưa có bình chọn.</p>
            )}
          </div>
        </details>
        {admin && !selected.finalized_at && (
          <div className="admin-match-actions">
            {new Date(selected.starts_at).getTime() > now && (
              <button
                className="button subtle"
                disabled={busy}
                onClick={() => {
                  const locked = !selected.voting_locked_at;
                  perform(
                    () => repo.setVotingLocked(demo, selected.id, locked),
                    locked
                      ? "Đã khóa bình chọn của trận này."
                      : "Đã mở lại bình chọn của trận này.",
                  );
                }}
              >
                <ShieldCheck size={15} />
                {selected.voting_locked_at
                  ? "Mở lại bình chọn"
                  : "Khóa bình chọn"}
              </button>
            )}
            <button
              className="button subtle"
              disabled={busy}
              onClick={() => setMatchForm(selected)}
            >
              <Pencil size={15} />
              Sửa lịch
            </button>
            <button
              className="button subtle"
              disabled={
                busy ||
                !selected.lineup ||
                yes.length < 2 ||
                new Date(selected.starts_at).getTime() > now
              }
              title="Chốt sau giờ bắt đầu và sau khi lưu đội hình"
              onClick={() => {
                setError("");
                setSettlementMatch(selected);
              }}
            >
              <ShieldCheck size={15} />
              Chốt thu tiền
            </button>
            <small>
              {selected.lineup
                ? "Chốt sau giờ bắt đầu trận. Nhập mức thu từng đội và tiền sân ở bước này."
                : "Chia và lưu đội A/B trước khi chốt thu tiền."}
            </small>
          </div>
        )}
      </section>
    );
  }

  function renderTeams() {
    if (!selected)
      return (
        <section className="panel">
          <Empty
            title="Chưa có buổi đá để chia đội"
            detail="Tạo lịch và chờ mọi người chọn Có tham gia."
          />
        </section>
      );
    const lineup = selected.lineup;
    return (
      <div className="teams-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CÂN BẰNG LEVEL & VỊ TRÍ</span>
              <h2>Hai đội, một tinh thần</h2>
            </div>
            <Shuffle size={22} className="text-green" />
          </div>
          <label className="field">
            Chọn buổi đá
            <select
              value={selected.id}
              onChange={(e) => selectMatch(e.target.value)}
            >
              {[...sessions].reverse().map((s) => (
                <option value={s.id} key={s.id}>
                  {day(s.starts_at)} · {s.title}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            {yes.length} người có đá. Thuật toán cân bằng số người, tổng level
            và các vị trí, ưu tiên chia đều thủ môn.
          </p>
          <button
            className="button primary"
            disabled={
              busy || !admin || yes.length < 2 || !!selected.finalized_at
            }
            onClick={() => {
              setError("");
              setLineupMatchId(selected.id);
            }}
          >
            <Shuffle size={16} />
            {lineup ? "Chia đội" : "Chia đội tự động"}
          </button>
          {admin && lineup && !selected.finalized_at && (
            <button
              className="button subtle"
              disabled={busy}
              onClick={() => {
                setError("");
                setSwapPlayerA(lineup.a[0] || "");
                setSwapPlayerB(lineup.b[0] || "");
                setSwapPlayersOpen(true);
              }}
            >
              <Shuffle size={16} />
              Đổi cầu thủ
            </button>
          )}
          {!admin && (
            <p className="hint">
              Quản trị viên sẽ chia đội khi có đủ người đăng ký.
            </p>
          )}
          {lineup ? (
            <>
              <div className="team-lists">
                {(["a", "b"] as const).map((team) => {
                  const players = lineup[team].map((id) => {
                    const p = profiles.find((p) => p.id === id)!;
                    const c = data!.charges.find(
                      (c) => c.session_id === selected.id && c.user_id === id,
                    );
                    return c
                      ? {
                          ...p,
                          full_name: c.full_name,
                          level: c.level,
                          position: c.position,
                        }
                      : p;
                  });
                  return (
                    <div key={team}>
                      <div className="team-list-heading">
                        <h3
                          className={team === "b" ? "team-b-title" : undefined}
                        >
                          Đội {team.toUpperCase()}
                          {selected[
                            team === "a" ? "team_a_color" : "team_b_color"
                          ] && (
                            <small className="team-shirt-label">
                              Áo{" "}
                              {
                                selected[
                                  team === "a" ? "team_a_color" : "team_b_color"
                                ]
                              }
                            </small>
                          )}
                        </h3>
                        <span>
                          {players.length} người ·{" "}
                          {players.reduce((n, p) => n + p.level, 0)} điểm
                        </span>
                      </div>
                      {players.map((p, i) => (
                        <div className="poll-person" key={p.id}>
                          <Avatar
                            name={p.full_name}
                            index={i + (team === "a" ? 0 : 2)}
                          />
                          <span>
                            {p.full_name}
                            <small>{positions[p.position]}</small>
                          </span>
                          <b className="level">
                            {p.level}/{MAX_LEVEL}
                          </b>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty
              title="Đội hình đang chờ anh em"
              detail="Cần ít nhất 2 người chọn Có tham gia để bắt đầu chia đội."
            />
          )}
        </section>
        {renderRegistration()}
      </div>
    );
  }

  function renderFund() {
    if (!summary) return null;
    return (
      <>
        <div className="fund-toolbar">
          <label>
            Tháng báo cáo
            <input
              aria-label="Tháng báo cáo"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          {admin && (
            <div className="button-group">
              <button
                className="button primary"
                onClick={() => setTransactionOpen(true)}
              >
                <Plus size={16} />
                Ghi thu / chi
              </button>
            </div>
          )}
        </div>
        <div className="stats-grid finance-stats">
          <Stat
            label="Số dư đầu kỳ"
            value={money(summary.opening)}
            detail="Chuyển từ tháng trước"
            icon={<Wallet size={20} />}
          />
          <Stat
            label="Tổng thu trong tháng"
            value={money(summary.income)}
            detail="Tiền đã thực nhận"
            icon={<ArrowDownLeft size={20} />}
          />
          <Stat
            label="Tổng chi trong tháng"
            value={money(summary.expense)}
            detail="Các khoản chi đã ghi nhận"
            icon={<ArrowUpRight size={20} />}
          />
          <Stat
            label="Số dư cuối kỳ"
            value={money(summary.closing)}
            detail={`Còn ${money(summary.unpaid)} chưa thu theo ngày đá`}
            icon={<Wallet size={20} />}
          />
        </div>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">THEO DANH SÁCH ĐÃ CHỐT</span>
              <h2>Đóng quỹ từng buổi</h2>
            </div>
            <span className="tag amber">
              {summary.charges.filter((c) => !c.paid_at).length} khoản chưa thu
            </span>
          </div>
          <p className="hint">
            Các buổi đá trong tháng {month.split("-").reverse().join("/")}. Chỉ
            người chọn Có tham gia lúc chốt mới có khoản phải đóng. Quản trị
            viên xác nhận sau khi thực nhận tiền.
          </p>
          <div className="settlement-history">
            {monthSessions
              .filter((m) =>
                summary.charges.some((c) => c.session_id === m.id && c.team),
              )
              .map((m) => {
                const charges = summary.charges.filter(
                  (c) => c.session_id === m.id,
                );
                const total = charges.reduce((sum, c) => sum + c.amount, 0);
                return (
                  <div className="settlement-record" key={m.id}>
                    <strong>
                      {day(m.starts_at)} · {m.title}
                    </strong>
                    <span>
                      Tiền sân {money(m.cost ?? 0)} · Tổng phải thu{" "}
                      {money(total)}
                    </span>
                    <span
                      className={
                        total < (m.cost ?? 0)
                          ? "fund-contribution"
                          : "fund-surplus"
                      }
                    >
                      {total < (m.cost ?? 0)
                        ? `Bù từ quỹ ${money((m.cost ?? 0) - total)}`
                        : `Dư vào quỹ khi thu đủ ${money(total - (m.cost ?? 0))}`}
                    </span>
                  </div>
                );
              })}
          </div>
          {summary.charges.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Thành viên</th>
                    <th>Buổi đá</th>
                    <th>Phải đóng</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.charges.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.full_name}</strong>
                        {c.team && <small>Đội {c.team}</small>}
                      </td>
                      <td>
                        {day(
                          sessions.find((s) => s.id === c.session_id)!
                            .starts_at,
                        )}
                        <small>
                          {sessions.find((s) => s.id === c.session_id)?.title}
                        </small>
                      </td>
                      <td className="numeric">{money(c.amount)}</td>
                      <td>
                        {c.amount === 0 ? (
                          <span className="tag neutral">Miễn đóng</span>
                        ) : c.paid_at ? (
                          <span className="tag green">
                            <Check size={13} />
                            Đã thu · {day(c.paid_at)}
                          </span>
                        ) : admin ? (
                          <button
                            className="button small-button outline"
                            disabled={busy}
                            onClick={() =>
                              setConfirmation({
                                title: "Xác nhận đã nhận tiền?",
                                body: `Ghi nhận đã thu ${money(c.amount)} từ ${c.full_name}. Khoản thu sẽ vào báo cáo tháng hiện tại theo ngày nhận tiền.`,
                                action: () => repo.markPaid(demo, c.id),
                              })
                            }
                          >
                            Xác nhận đã thu
                          </button>
                        ) : (
                          <span className="tag amber">Chưa thu</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Chưa có khoản đóng quỹ"
              detail="Chia đội rồi chốt mức thu mỗi người đội A, đội B và tiền sân."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Sổ thu chi tháng</h2>
            <span className="muted">{summary.tx.length} giao dịch</span>
          </div>
          <p className="hint">
            Tính theo ngày thực thu / chi (giờ Việt Nam). Tiền chưa thu được
            theo dõi riêng, chưa cộng vào số dư.
          </p>
          {summary.tx.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Nội dung</th>
                    <th>Loại</th>
                    <th className="numeric">Số tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summary.tx]
                    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
                    .map((t) => (
                      <tr key={t.id}>
                        <td>{day(t.occurred_at)}</td>
                        <td>{t.description}</td>
                        <td>
                          <span
                            className={`tag ${t.kind === "income" ? "green" : "neutral"}`}
                          >
                            {t.kind === "income" ? "Thu" : "Chi"}
                          </span>
                        </td>
                        <td
                          className={`numeric ${t.kind === "income" ? "text-green" : "text-red"}`}
                        >
                          {t.kind === "income" ? "+" : "−"}
                          {money(t.amount)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Tháng này chưa có thu chi"
              detail="Các khoản thu và chi sẽ được ghi lại tại đây."
            />
          )}
        </section>
      </>
    );
  }

  function renderMembers() {
    const list = profiles.filter(
      (p) =>
        (admin || p.active) &&
        p.full_name
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi")),
    );
    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ANH EM CHUNG MỘT ĐỘI</span>
            <h2>
              Danh sách MEM FC{" "}
              <span className="count-badge">{activeMembers.length}</span>
            </h2>
          </div>
          {admin && (
            <button
              className="button primary"
              onClick={() => setMemberForm("new")}
            >
              <Plus size={16} />
              Thêm thành viên
            </button>
          )}
        </div>
        <p className="muted">
          Danh sách mặc định được đưa vào mỗi trận mới. Level từ 1 đến 3 giúp
          chia đội cân bằng.
        </p>
        <div className="search-box">
          <Search size={16} />
          <input
            aria-label="Tìm thành viên"
            placeholder="Tìm tên thành viên…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="members-grid">
          {list.map((p, i) => (
            <div
              className={`member-card ${p.active ? "" : "inactive"}`}
              key={p.id}
            >
              <div className="row-between">
                <Avatar name={p.full_name} index={i} />
                {admin && (
                  <button
                    className="icon-button"
                    onClick={() => setMemberForm(p)}
                    aria-label={`Sửa ${p.full_name}`}
                  >
                    <Pencil size={15} />
                  </button>
                )}
              </div>
              <h3>{p.full_name}</h3>
              <div className="row-between">
                <span className="tag neutral">{positions[p.position]}</span>
                <span
                  className="level-dots"
                  aria-label={`Level ${p.level} trên ${MAX_LEVEL}`}
                >
                  {LEVELS.map((n) => (
                    <i className={n <= p.level ? "filled" : ""} key={n} />
                  ))}
                </span>
              </div>
              <small>
                {p.active
                  ? `Level ${p.level}/${MAX_LEVEL} · Đang trong đội`
                  : "Tạm ngừng · Giữ nguyên lịch sử"}
              </small>
            </div>
          ))}
        </div>
        {!list.length && (
          <Empty
            title="Chưa có thành viên phù hợp"
            detail={
              admin
                ? "Thêm danh sách anh em để bắt đầu tạo lịch đá."
                : "Danh sách sẽ được quản trị viên cập nhật."
            }
          />
        )}
      </section>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Đi đến nội dung
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <Crest />
          <span>
            MEM<span className="brand-fc"> FC</span>
            <small>FOOTBALL CLUB</small>
          </span>
        </a>
        <div className="sidebar-divider" />
        <div className="sidebar-caption">KHÔNG GIAN ĐỘI BÓNG</div>
        <nav aria-label="Điều hướng chính">
          {navigation.map((n) => (
            <button
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              key={n.id}
              onClick={() => {
                setTab(n.id);
                setSearch("");
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "attendance" && upcoming.length > 0 && (
                <b>{upcoming.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="club-note">
            <Trophy size={22} />
            <p>
              Cùng ra sân.
              <br />
              <strong>Cùng hết mình.</strong>
            </p>
            <span>ONE TEAM. ONE SPIRIT.</span>
          </div>
          <button
            className="admin-link"
            disabled={busy}
            onClick={() => {
              if (demo) {
                setLoginOpen(true);
              } else if (admin) {
                perform(async () => {
                  const { error } = await supabase!.auth.signOut();
                  if (error) throw error;
                  setAdmin(false);
                  setTab("attendance");
                }, "Đã đăng xuất quản trị.");
              } else setLoginOpen(true);
            }}
          >
            {admin && !demo ? <LogOut size={16} /> : <ShieldCheck size={16} />}
            <span>
              {admin && !demo ? "Đăng xuất quản trị" : "Quản trị viên"}
            </span>
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            MEM FC <ChevronRight size={13} />
            <span>{heading.label}</span>
          </div>
          <div className="topbar-right">
            <span className={`connection-dot ${demo ? "demo-dot" : ""}`} />
            <span>{demo ? "Bản dùng thử" : "Không gian chung"}</span>
            {admin && (
              <span className="admin-badge">
                <ShieldCheck size={13} />
                Quản trị
              </span>
            )}
            <button
              className="header-avatar"
              aria-label={
                admin && !demo ? "Đăng xuất quản trị" : "Đăng nhập quản trị"
              }
              onClick={() => {
                if (admin && !demo)
                  setConfirmation({
                    title: "Đăng xuất quản trị?",
                    body: "Bạn vẫn có thể chọn tên và bình chọn sau khi đăng xuất.",
                    action: async () => {
                      const { error } = await supabase!.auth.signOut();
                      if (error) throw error;
                      setAdmin(false);
                      setTab("attendance");
                    },
                  });
                else setLoginOpen(true);
              }}
            >
              <Crest small />
            </button>
          </div>
        </header>
        <main id="main-content">
          <div
            className={`page-heading${tab === "fund" ? " fund-page-heading" : ""}`}
          >
            <div>
              <div className="eyebrow">
                MEM FC · {ready ? new Date().getFullYear() : ""}
              </div>
              <h1>
                {heading.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {tab === "attendance"
                  ? "Chọn trận để xem đăng ký. Chỉ trận sắp diễn ra mới nhận bình chọn."
                  : tab === "teams"
                    ? "Cân sức hai bên, để mỗi trận đấu đều đáng chơi."
                    : tab === "members"
                      ? "Những người làm nên tinh thần MEM FC."
                      : "Ghi rõ từng khoản, cùng giữ quỹ minh bạch."}
              </p>
            </div>
            {tab === "fund" && (
              <aside
                className="fund-bank-card"
                aria-label="Tài khoản đóng quỹ MEM FC"
              >
                <div className="fund-bank-details">
                  <span className="eyebrow">TÀI KHOẢN ĐÓNG QUỸ</span>
                  <strong className="fund-bank-name">VIB</strong>
                  <span className="fund-account-number">020568736</span>
                  <span className="fund-account-holder">
                    NGUYỄN PHƯƠNG ĐỈNH
                  </span>
                </div>
                <a
                  className="fund-bank-qr"
                  href="/vib-020568736.svg"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Mở mã QR chuyển khoản VIB 020568736 của Nguyễn Phương Đỉnh"
                >
                  <img
                    src="/vib-020568736.svg"
                    width={150}
                    height={150}
                    alt="QR chuyển khoản VIB, số tài khoản 020568736, Nguyễn Phương Đỉnh"
                  />
                  <span>Quét mã để đóng quỹ</span>
                </a>
              </aside>
            )}
            {admin && tab !== "fund" && tab !== "members" && (
              <button
                className="button primary"
                onClick={() => setMatchForm("new")}
              >
                <Plus size={18} />
                Tạo lịch đá
              </button>
            )}
          </div>
          {demo && (
            <div className="demo-banner">
              <span>
                <CircleDot size={16} />
                <strong>Chế độ dùng thử</strong>
                <span>
                  Danh sách MEM FC đã sẵn sàng. Dữ liệu chỉ lưu trên trình duyệt
                  này, chưa chia sẻ cho cả đội.
                </span>
              </span>
              {supabase ? (
                <button
                  onClick={() => {
                    setDemo(false);
                    setAdmin(false);
                    setData(null);
                  }}
                >
                  Về dữ liệu thật <ArrowRight size={14} />
                </button>
              ) : (
                <span className="demo-setup">
                  Cần kết nối Supabase để dùng chung
                </span>
              )}
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Ẩn thông báo lỗi"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {!data ? (
            <section className="panel">
              <div className="empty">
                {error ? (
                  <>
                    <h3>Chưa tải được dữ liệu</h3>
                    <p>
                      Kiểm tra kết nối Supabase và chạy migration trước khi sử
                      dụng.
                    </p>
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={() => perform(refresh, "Đã tải lại dữ liệu.")}
                    >
                      <RefreshCw size={16} />
                      Thử lại
                    </button>
                  </>
                ) : (
                  <>
                    <LoaderCircle size={28} className="spin" />
                    <p>Đang chuẩn bị sân…</p>
                  </>
                )}
              </div>
            </section>
          ) : (
            <>
              {tab === "attendance" && (
                <div
                  className={`dashboard-grid${selected ? "" : " attendance-list-only"}`}
                >
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Danh sách trận đấu</h2>
                      <span className="muted">{sessions.length} trận</span>
                    </div>
                    <div className="filter-tabs">
                      {[
                        ["all", "Tất cả"],
                        ["upcoming", "Sắp diễn ra"],
                        ["past", "Đã diễn ra"],
                      ].map(([id, label]) => (
                        <button
                          key={id}
                          className={filter === id ? "active" : ""}
                          onClick={() => selectMatchFilter(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="search-box">
                      <Search size={16} />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Tìm trận đấu hoặc tên sân…"
                        aria-label="Tìm trận đấu"
                      />
                    </div>
                    {renderMatchList()}
                  </section>
                  {selected && renderRegistration()}
                </div>
              )}
              {tab === "teams" && renderTeams()}
              {tab === "fund" && renderFund()}
              {tab === "members" && renderMembers()}
            </>
          )}
          <footer>
            <span>
              MEM FC <span>·</span> Cùng ra sân, cùng hết mình.
            </span>
            <span>Giờ Việt Nam (UTC+7)</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Ẩn thông báo">
            <X size={16} />
          </button>
        </div>
      )}
      {matchForm && (
        <Modal
          title={matchForm === "new" ? "Tạo lịch đá mới" : "Chỉnh sửa lịch đá"}
          onClose={closeMatch}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const input: MatchInput = {
                title: String(f.get("title")).trim(),
                starts_at: isoInput(String(f.get("starts_at"))),
                duration: Number(f.get("duration")),
                venue: String(f.get("venue")).trim(),
                address: String(f.get("address")).trim(),
                notes: String(f.get("notes")).trim(),
              };
              perform(
                () =>
                  repo.saveMatch(
                    demo,
                    input,
                    matchForm === "new" ? undefined : matchForm.id,
                  ),
                "Đã lưu lịch đá. Gửi link để anh em xác nhận nhé!",
                (id) => {
                  closeMatch();
                  selectMatch(id);
                  setTab("attendance");
                  setFilter(
                    new Date(input.starts_at).getTime() <= Date.now()
                      ? "past"
                      : "upcoming",
                  );
                },
              );
            }}
          >
            <p className="muted">
              {matchForm === "new"
                ? `${activeMembers.length} thành viên đang hoạt động sẽ có trong danh sách bình chọn. Tên thêm sau sẽ áp dụng cho trận mới.`
                : `Giữ nguyên danh sách ${matchForm.roster_ids.length} thành viên khi tạo trận.`}
            </p>
            <label className="field">
              Tên buổi đá
              <input
                name="title"
                required
                maxLength={120}
                placeholder="Ví dụ: Kèo tối thứ Sáu"
                defaultValue={matchForm === "new" ? "" : matchForm.title}
              />
            </label>
            <div className="form-row">
              <label className="field">
                Ngày & giờ (Việt Nam)
                <input
                  type="datetime-local"
                  name="starts_at"
                  required
                  defaultValue={localInput(
                    matchForm === "new"
                      ? new Date(Date.now() + 86400000).toISOString()
                      : matchForm.starts_at,
                  )}
                />
              </label>
              <label className="field">
                Thời lượng (phút)
                <input
                  type="number"
                  name="duration"
                  required
                  min={30}
                  max={360}
                  step={1}
                  defaultValue={matchForm === "new" ? 90 : matchForm.duration}
                />
              </label>
            </div>
            <label className="field">
              Tên sân
              <input
                name="venue"
                required
                maxLength={160}
                placeholder="Tên sân bóng"
                defaultValue={matchForm === "new" ? "" : matchForm.venue}
              />
            </label>
            <label className="field">
              Địa chỉ sân
              <input
                name="address"
                maxLength={300}
                placeholder="Đường, phường, quận / thành phố"
                defaultValue={matchForm === "new" ? "" : matchForm.address}
              />
            </label>
            <p className="hint">
              Tiền sân và mức thu mỗi người của từng đội sẽ được nhập khi chốt
              thu tiền.
            </p>
            <label className="field">
              Lời nhắn cho anh em
              <textarea
                name="notes"
                rows={3}
                maxLength={1500}
                placeholder="Màu áo, giờ tập trung…"
                defaultValue={matchForm === "new" ? "" : matchForm.notes}
              />
            </label>
            <button
              className="button primary full-width"
              disabled={busy || !activeMembers.length}
            >
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <CalendarDays size={16} />
              )}
              Lưu lịch đá
            </button>
          </form>
        </Modal>
      )}
      {memberForm && (
        <Modal
          title={
            memberForm === "new" ? "Thêm thành viên" : memberForm.full_name
          }
          onClose={closeMember}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const pos = String(f.get("position")) as Position,
                level = Number(f.get("level"));
              perform(
                () =>
                  memberForm === "new"
                    ? repo.addMember(
                        demo,
                        String(f.get("full_name")),
                        pos,
                        level,
                      )
                    : repo.updateMember(
                        demo,
                        memberForm.id,
                        pos,
                        level,
                        f.get("active") === "on",
                      ),
                "Đã cập nhật danh sách đội.",
                closeMember,
              );
            }}
          >
            {memberForm === "new" && (
              <label className="field">
                Họ và tên
                <input
                  name="full_name"
                  required
                  maxLength={80}
                  placeholder="Nhập tên để anh em chọn khi đăng ký"
                />
              </label>
            )}
            <div className="form-row">
              <label className="field">
                Vị trí
                <select
                  name="position"
                  defaultValue={
                    memberForm === "new" ? "MF" : memberForm.position
                  }
                >
                  {Object.entries(positions).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Level
                <select
                  name="level"
                  defaultValue={memberForm === "new" ? 3 : memberForm.level}
                >
                  {LEVELS.map((n) => (
                    <option value={n} key={n}>
                      {n}/{MAX_LEVEL}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {memberForm !== "new" && (
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={memberForm.active}
                />
                Có trong danh sách đội cho các trận mới
              </label>
            )}
            <p className="hint">
              Danh sách và khoản quỹ của buổi đã chốt được giữ nguyên. Thay đổi
              level hoặc vị trí sẽ xóa đội hình chưa chốt để chia lại.
            </p>
            <button className="button primary full-width" disabled={busy}>
              Lưu thành viên
            </button>
          </form>
        </Modal>
      )}
      {loginOpen && (
        <Modal title="Đăng nhập quản trị" onClose={closeLogin}>
          {supabase ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                setBusy(true);
                setError("");
                try {
                  const { error } = await supabase!.auth.signInWithPassword({
                    email: String(f.get("email")),
                    password: String(f.get("password")),
                  });
                  if (error) throw error;
                  const result = await supabase!.rpc("is_admin");
                  if (result.error) throw result.error;
                  if (!result.data) {
                    await supabase!.auth.signOut();
                    throw new Error(
                      "Tài khoản chưa được cấp quyền quản trị. Hãy thêm vào bảng admins trên Supabase.",
                    );
                  }
                  setDemo(false);
                  setAdmin(true);
                  closeLogin();
                  setNotice("Đã đăng nhập quản trị.");
                } catch (e) {
                  setError(messageOf(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <p className="muted">
                Dành cho người quản lý lịch đá, danh sách đội và quỹ.
              </p>
              <label className="field">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label className="field">
                Mật khẩu
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <button className="button primary full-width" disabled={busy}>
                {busy && <LoaderCircle size={16} className="spin" />}Đăng nhập
              </button>
            </form>
          ) : (
            <div>
              <p className="muted">
                App chưa được kết nối Supabase. Cấu hình hai biến trong
                .env.local và chạy migration để lưu dữ liệu chung.
              </p>
              <p className="hint">
                Bản dùng thử có sẵn danh sách MEM FC và cho phép trải nghiệm các
                chức năng quản trị trên trình duyệt này.
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </Modal>
      )}
      {transactionOpen && admin && (
        <Modal title="Ghi khoản thu / chi" onClose={closeTransaction}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const date = isoInput(String(f.get("occurred")));
              if (new Date(date).getTime() > Date.now()) {
                setError(
                  "Thời điểm thu chi phải là hiện tại hoặc trong quá khứ.",
                );
                return;
              }
              perform(
                () =>
                  repo.addTransaction(
                    demo,
                    String(f.get("kind")) as "income" | "expense",
                    Number(f.get("amount")),
                    String(f.get("description")),
                    date,
                  ),
                "Đã ghi nhận giao dịch.",
                closeTransaction,
              );
            }}
          >
            <p className="hint">
              Dùng cho quỹ đầu kỳ, tài trợ hoặc khoản chi khác. Tiền sân và tiền
              đóng từng người đã được ghi tự động, không ghi trùng ở đây.
            </p>
            <label className="field">
              Loại giao dịch
              <select name="kind">
                <option value="income">Thu vào quỹ</option>
                <option value="expense">Chi từ quỹ</option>
              </select>
            </label>
            <label className="field">
              Số tiền (VNĐ)
              <input
                name="amount"
                type="number"
                min={1}
                max={100000000}
                step={1}
                required
              />
            </label>
            <label className="field">
              Nội dung
              <input
                name="description"
                required
                maxLength={300}
                placeholder="Ví dụ: Quỹ đầu kỳ, mua bóng…"
              />
            </label>
            <label className="field">
              Thời điểm thực thu / chi
              <input
                type="datetime-local"
                name="occurred"
                required
                max={localInput(new Date().toISOString())}
                defaultValue={localInput(new Date().toISOString())}
              />
            </label>
            <button className="button primary full-width" disabled={busy}>
              Ghi nhận giao dịch
            </button>
          </form>
        </Modal>
      )}
      {swapPlayersOpen && selected?.lineup && (
        <Modal title="Đổi cầu thủ giữa hai đội" onClose={closeSwapPlayers}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (busy || !admin) return;
              const current = selected.lineup;
              if (
                !current ||
                selected.finalized_at ||
                !current.a.includes(swapPlayerA) ||
                !current.b.includes(swapPlayerB)
              ) {
                setError("Đội hình đã thay đổi. Hãy tải lại rồi chọn lại cầu thủ.");
                return;
              }
              const nextLineup = {
                a: current.a.map((id) => id === swapPlayerA ? swapPlayerB : id),
                b: current.b.map((id) => id === swapPlayerB ? swapPlayerA : id),
              };
              perform(
                () => repo.updateLineup(demo, selected.id, nextLineup),
                "Đã đổi cầu thủ và cập nhật đội hình cho mọi người.",
                closeSwapPlayers,
              );
            }}
          >
            <p className="muted">
              Chọn một cầu thủ ở mỗi đội. Số người mỗi đội được giữ nguyên.
            </p>
            <div className="form-row">
              <label className="field">
                Đội A
                <select
                  value={swapPlayerA}
                  onChange={(e) => setSwapPlayerA(e.target.value)}
                  disabled={busy || !admin || !!selected.finalized_at}
                  required
                >
                  {selected.lineup.a.map((id) => (
                    <option value={id} key={id}>
                      {profiles.find((p) => p.id === id)?.full_name || id}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Đội B
                <select
                  value={swapPlayerB}
                  onChange={(e) => setSwapPlayerB(e.target.value)}
                  disabled={busy || !admin || !!selected.finalized_at}
                  required
                >
                  {selected.lineup.b.map((id) => (
                    <option value={id} key={id}>
                      {profiles.find((p) => p.id === id)?.full_name || id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selected.finalized_at && (
              <p role="alert" className="inline-error">
                Buổi đá đã chốt quỹ nên không thể đổi đội hình.
              </p>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button
              className="button primary full-width"
              disabled={busy || !admin || !!selected.finalized_at}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Shuffle size={16} />
              )}
              Lưu đổi đội
            </button>
          </form>
        </Modal>
      )}
      {lineupMatchId && (
        <Modal title="Màu áo hai đội" onClose={closeLineup}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (busy || !admin) return;
              const form = new FormData(e.currentTarget);
              const colors = {
                a: String(form.get("team_a_color") || "").trim(),
                b: String(form.get("team_b_color") || "").trim(),
              };
              if (!colors.a || !colors.b) {
                setError("Hãy nhập màu áo cho cả hai đội.");
                return;
              }
              const matchId = lineupMatchId;
              perform(
                async () => {
                  if (!lineupMatch || lineupMatch.finalized_at)
                    throw new Error("Buổi đá đã chốt hoặc không còn tồn tại.");
                  const participants = profiles.filter((p) =>
                    data?.votes.some(
                      (v) =>
                        v.session_id === matchId &&
                        v.user_id === p.id &&
                        v.status === "yes",
                    ),
                  );
                  await repo.saveLineup(
                    demo,
                    matchId,
                    balanceTeams(participants),
                    colors,
                  );
                },
                "Đã lưu hai đội và màu áo. Cả đội có thể xem đội hình.",
                closeLineup,
              );
            }}
          >
            <p className="muted">{lineupMatch?.title}</p>
            <div className="form-row">
              <label className="field">
                Màu áo đội A
                <input
                  name="team_a_color"
                  placeholder="Ví dụ: Đỏ"
                  defaultValue={lineupMatch?.team_a_color || ""}
                  maxLength={40}
                  autoComplete="off"
                  disabled={busy}
                  required
                />
              </label>
              <label className="field">
                Màu áo đội B
                <input
                  name="team_b_color"
                  placeholder="Ví dụ: Trắng"
                  defaultValue={lineupMatch?.team_b_color || ""}
                  maxLength={40}
                  autoComplete="off"
                  disabled={busy}
                  required
                />
              </label>
            </div>
            <p className="hint">
              Màu áo được lưu cùng đội hình, vẫn còn khi tải lại trang và hiển
              thị cho cả đội trên các thiết bị khác.
            </p>
            {(!lineupMatch || lineupMatch.finalized_at) && (
              <p role="alert" className="inline-error">
                Buổi đá đã chốt hoặc không còn tồn tại. Hãy chọn buổi khác.
              </p>
            )}
            {error && (
              <p role="alert" className="inline-error">
                {error}
              </p>
            )}
            <button
              className="button primary full-width"
              disabled={
                busy || !admin || !lineupMatch || !!lineupMatch.finalized_at
              }
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Shuffle size={16} />
              )}
              Xác nhận chia đội
            </button>
          </form>
        </Modal>
      )}
      {settlementMatch && data && (
        <SettlementForm
          match={settlementMatch}
          participants={data.votes
            .filter(
              (v) => v.session_id === settlementMatch.id && v.status === "yes",
            )
            .map((v) => v.user_id)}
          balance={cashBalance(data.transactions)}
          stale={
            !!data.sessions.find((m) => m.id === settlementMatch.id)
              ?.finalized_at ||
            JSON.stringify(
              data.sessions.find((m) => m.id === settlementMatch.id)?.lineup,
            ) !== JSON.stringify(settlementMatch.lineup)
          }
          busy={busy}
          error={error}
          onClose={closeSettlement}
          onSubmit={(input) =>
            perform(
              () => repo.finalize(demo, settlementMatch.id, input),
              "Đã chốt khoản phải đóng. Xác nhận từng người khi thực nhận tiền.",
              closeSettlement,
            )
          }
        />
      )}
      {confirmation && (
        <Modal title={confirmation.title} onClose={closeConfirm}>
          <p className="confirmation-body">{confirmation.body}</p>
          <div className="form-row">
            <button className="button outline" onClick={closeConfirm}>
              Xem lại
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                perform(
                  confirmation.action,
                  "Đã ghi nhận thành công.",
                  closeConfirm,
                )
              }
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              Xác nhận
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SettlementForm({
  match,
  participants,
  balance,
  stale,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  match: Match;
  participants: string[];
  balance: number;
  stale: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (input: SettlementInput) => void;
}) {
  const [teamAFee, setTeamAFee] = useState("");
  const [teamBFee, setTeamBFee] = useState("");
  const [cost, setCost] = useState(
    match.cost === null ? "" : String(match.cost),
  );
  const input: SettlementInput = {
    teamAFee: teamAFee.trim() ? Number(teamAFee) : NaN,
    teamBFee: teamBFee.trim() ? Number(teamBFee) : NaN,
    cost: cost.trim() ? Number(cost) : NaN,
    lineup: match.lineup || { a: [], b: [] },
  };
  let plan: ReturnType<typeof settlementPlan> | null = null;
  let validation = "";
  try {
    plan = settlementPlan(input, participants, balance);
  } catch (e) {
    if (teamAFee && teamBFee && cost) validation = messageOf(e);
  }
  const aCount = match.lineup?.a.length || 0,
    bCount = match.lineup?.b.length || 0;
  return (
    <Modal title="Chốt thu tiền" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy && !stale && plan && !plan.shortfall) onSubmit(input);
        }}
      >
        <p className="hint">
          {match.title} · Đội A {aCount} người · Đội B {bCount} người. Chốt sẽ
          khóa bình chọn và lưu khoản phải đóng; xác nhận đã thu riêng từng
          người sau.
        </p>
        <div className="form-row">
          <label className="field">
            Đội A — tiền mỗi người (VNĐ)
            <input
              name="team_a_fee"
              type="number"
              min={0}
              max={100000000}
              step={1}
              required
              value={teamAFee}
              disabled={busy}
              onChange={(e) => setTeamAFee(e.target.value)}
            />
          </label>
          <label className="field">
            Đội B — tiền mỗi người (VNĐ)
            <input
              name="team_b_fee"
              type="number"
              min={0}
              max={100000000}
              step={1}
              required
              value={teamBFee}
              disabled={busy}
              onChange={(e) => setTeamBFee(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Tiền sân (VNĐ)
          <input
            name="field_cost"
            type="number"
            min={0}
            max={100000000}
            step={1}
            required
            value={cost}
            disabled={busy}
            onChange={(e) => setCost(e.target.value)}
          />
        </label>
        {plan && (
          <dl className="settlement-summary" aria-live="polite">
            <div>
              <dt>
                Đội A · {aCount} × {money(input.teamAFee)}
              </dt>
              <dd>{money(plan.aTotal)}</dd>
            </div>
            <div>
              <dt>
                Đội B · {bCount} × {money(input.teamBFee)}
              </dt>
              <dd>{money(plan.bTotal)}</dd>
            </div>
            <div>
              <dt>Tổng phải thu</dt>
              <dd>{money(plan.total)}</dd>
            </div>
            <div>
              <dt>Tiền sân</dt>
              <dd>{money(input.cost)}</dd>
            </div>
            <div>
              <dt>Số dư quỹ trước trận</dt>
              <dd>{money(balance)}</dd>
            </div>
            <div
              className={plan.fundUsed ? "fund-contribution" : "fund-surplus"}
            >
              <dt>
                {plan.fundUsed ? "Cần bù từ quỹ" : "Dư vào quỹ khi thu đủ"}
              </dt>
              <dd>{money(plan.fundUsed || plan.surplus)}</dd>
            </div>
            <div
              className={
                plan.shortfall ? "settlement-shortfall" : "settlement-total"
              }
            >
              <dt>Số dư dự kiến sau khi thu đủ</dt>
              <dd>{money(plan.projectedBalance)}</dd>
            </div>
          </dl>
        )}
        <p className="hint">
          Số dư quỹ gồm tiền chuyển kỳ và các khoản thực thu/chi đến hiện tại.
          Chưa cộng các khoản chưa thu. Tiền sân được ghi chi khi chốt; số dư
          thực thu có thể tạm âm trong lúc chờ mọi người đóng tiền. Phần bù
          không bị trừ thêm lần nữa.
        </p>
        {plan && plan.shortfall > 0 && (
          <p className="settlement-error" role="alert">
            Còn thiếu {money(plan.shortfall)}. Hãy tăng mức thu hoặc xác nhận
            các khoản đã thực nhận trước khi chốt.
          </p>
        )}
        {stale && (
          <p className="settlement-error" role="alert">
            Đội hình hoặc danh sách đã thay đổi. Đóng cửa sổ và chia, lưu lại
            đội trước khi chốt.
          </p>
        )}
        {(validation || error) && (
          <p className="settlement-error" role="alert">
            {validation || error}
          </p>
        )}
        <button
          className="button primary full-width"
          disabled={busy || stale || !plan || plan.shortfall > 0}
        >
          {busy ? (
            <LoaderCircle size={16} className="spin" />
          ) : (
            <ShieldCheck size={16} />
          )}{" "}
          Xác nhận chốt khoản phải đóng
        </button>
      </form>
    </Modal>
  );
}

function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}
