"use client";

import { useEffect, useRef, useState } from "react";
import type { CharacterDetail, ProviderSummary } from "@/types/chat";
import { compressImageFile } from "@/lib/compressImage";
import { parseBibleFile } from "@/lib/characterBible";
import { parseCharacterProfileDossier } from "@/lib/characterProfileDossier";
import { OWNER_PROFILE_SHARE_OPTIONS, type OwnerProfileShareField } from "@/lib/characterInvite";
import { GENDER_OPTIONS, type Gender } from "@/lib/gender";
import {
  MAX_CHARACTER_SKILLS,
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_TITLE_CHARS,
  validateCharacterSkillPortfolio,
  type CharacterSkill,
} from "@/lib/characterSkills";
import {
  CHARACTER_STARTER_ARCHETYPES,
  type CharacterStarterArchetype,
} from "@/lib/characterStarter";
import { characterNameError, cleanCharacterName, normalizeCharacterName } from "@/lib/characterNames";
import {
  MAX_BIBLE_CHARS,
  MAX_CHARACTER_AGE,
  MAX_CHARACTER_NAME_CHARS,
  MAX_CHARACTER_ORIGIN_CHARS,
  MAX_CHARACTER_PROFESSION_CHARS,
  MIN_CHARACTER_AGE,
  MAX_OWNER_RELATIONSHIP_CHARS,
  MAX_PERSONALITY_CHARS,
  MAX_SHORT_BIO_CHARS,
  MAX_SHARED_TEAM_MEMORY_CHARS,
  MAX_TEAM_ROLE_CHARS,
} from "@/lib/limits";
import { Avatar } from "./Avatar";
import { AvatarCropModal } from "./AvatarCropModal";
import { CameraIcon, XIcon } from "./icons";

const FIELD =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-base text-ink outline-none transition placeholder:text-muted focus:border-ink sm:py-2 sm:text-sm";

const PERSONALITY_PLACEHOLDER = `Contoh:
Nama: Kirana, 24 tahun, beauty talent di AK Talent.
Latar belakang: Asli Bogor, kos di Jakarta, sering syuting skincare.
Kepribadian: Ceria di depan kamera, aslinya overthinking, gampang gugup.
Gaya bicara: Kalimat pendek, beberapa pesan beruntun, kadang "wkwk".
Hubungan dengan lawan bicara: Teman dekat yang dia percaya.`;

const BIBLE_PLACEHOLDER = `Tempel naskah bible di sini, atau klik "Impor berkas".

Bebas formatnya. Yang paling berpengaruh biasanya:
PERAN / LATAR / CARA BICARA / HUBUNGAN / RAHASIA.`;

function charCount(value: string, max: number) {
  const over = value.length > max;
  return (
    <span className={over ? "text-rose-500" : "text-muted"}>
      {value.length.toLocaleString("id-ID")} / {max.toLocaleString("id-ID")}
    </span>
  );
}

export function CharacterModal({
  initial,
  providers,
  existingNames = [],
  onboardingMode = false,
  onClose,
  onSaved,
}: {
  initial?: CharacterDetail | null;
  providers: ProviderSummary[];
  existingNames?: string[];
  onboardingMode?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [gender, setGender] = useState<Gender>(initial?.gender ?? "");
  const [age, setAge] = useState(initial?.age?.toString() ?? "");
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [profession, setProfession] = useState(initial?.profession ?? "");
  const [shortBio, setShortBio] = useState(initial?.shortBio ?? "");
  const [skillPortfolio, setSkillPortfolio] = useState<CharacterSkill[]>(initial?.skillPortfolio ?? []);
  const [teamRole, setTeamRole] = useState(initial?.teamRole ?? "");
  const [sharedTeamMemory, setSharedTeamMemory] = useState(initial?.sharedTeamMemory ?? "");
  const [shareTeamMemory, setShareTeamMemory] = useState(initial?.shareTeamMemory ?? false);
  const [shareOwnerProfileFields, setShareOwnerProfileFields] = useState<OwnerProfileShareField[]>(
    initial?.shareOwnerProfileFields ?? []
  );
  const [personality, setPersonality] = useState(initial?.personality ?? "");
  const [bible, setBible] = useState(initial?.bible ?? "");
  const [ownerRelationship, setOwnerRelationship] = useState(initial?.ownerRelationship ?? "");
  const [greeting, setGreeting] = useState(initial?.greeting ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatarUrl ?? null);
  const [cropSource, setCropSource] = useState<File | string | null>(null);
  const [providerId, setProviderId] = useState<string>(initial?.providerId ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [detectedModels, setDetectedModels] = useState<string[]>([]);
  const [detectingModels, setDetectingModels] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateNotice, setGenerateNotice] = useState<string | null>(null);
  const [starterArchetype, setStarterArchetype] = useState<CharacterStarterArchetype>("supportive_friend");
  const [starterConcept, setStarterConcept] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const [dossierImportFeedback, setDossierImportFeedback] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bibleFileRef = useRef<HTMLInputElement>(null);
  const dossierFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !cropSource) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, cropSource]);

  const resolvedProvider = providerId
    ? providers.find((p) => p.id === providerId)
    : providers.find((p) => p.isDefault) ?? providers[0];
  const hasAiProvider = providers.some((provider) => provider.hasKey || provider.backupCount > 0);

  async function detectCharacterModels() {
    if (!resolvedProvider) {
      setDetectError("Tambahkan provider AI di Setelan dulu.");
      return;
    }
    setDetectingModels(true);
    setDetectError(null);
    try {
      const res = await fetch("/api/providers/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: resolvedProvider.id,
          type: resolvedProvider.type,
          currentModel: model.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setDetectError(data.error || "Gagal mendeteksi model.");
        return;
      }
      const recs = Array.isArray(data.recommended) ? (data.recommended as string[]) : [];
      const allIds = Array.isArray(data.models)
        ? (data.models as { id: string }[]).map((m) => m.id)
        : [];
      const merged = [...new Set([...recs, ...allIds])].slice(0, 8);
      setDetectedModels(merged);
    } catch {
      setDetectError("Koneksi gagal saat mendeteksi model.");
    } finally {
      setDetectingModels(false);
    }
  }

  async function uploadCroppedAvatar(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImageFile(file, {
        maxSize: 512,
        quality: 0.86,
      });
      const fd = new FormData();
      fd.append("file", compressed);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengunggah foto.");
      setAvatarUrl(data.url);
      setCropSource(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setUploading(false);
    }
  }

  function handleAvatarPick(file: File) {
    setError(null);
    if (file.type === "image/gif") {
      void uploadCroppedAvatar(file);
      return;
    }
    setCropSource(file);
  }

  async function generateCharacterProfile(regenerateProfession = false) {
    if (generating) return;
    const nameProblem = name.trim() ? characterNameError(name) : null;
    if (nameProblem) {
      setGenerateError(nameProblem);
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    setGenerateNotice(null);
    try {
      const res = await fetch("/api/characters/generate-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          archetype: initial && regenerateProfession ? "custom" : starterArchetype,
          concept: starterConcept,
          ...(regenerateProfession ? { fieldsToRegenerate: ["profession"] } : {}),
          name,
          age: age.trim() ? Number(age) : null,
          gender,
          origin,
          profession,
          skillPortfolio,
          shortBio,
          personality,
          bible,
          greeting,
          excludeCharacterId: initial?.id ?? null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.draft) {
        throw new Error(data?.error || "Gagal membuat draf karakter.");
      }
      if (regenerateProfession) {
        const suggestion = (data.draft as { profession?: unknown }).profession;
        if (typeof suggestion !== "string" || !suggestion.trim()) {
          throw new Error("AI belum menghasilkan usulan profesi yang bisa dipakai. Coba lagi.");
        }
        setProfession(suggestion.trim());
        setGenerateNotice("Usulan profesi terisi. Tinjau dan sesuaikan sebelum menyimpan.");
        return;
      }

      const draft = data.draft as {
        name: string;
        age: number | null;
        gender: Gender;
        origin: string;
        profession: string;
        shortBio: string;
        skillPortfolio: CharacterSkill[];
        personality: string;
        bible: string;
        greeting: string;
      };
      if (!name.trim()) setName(draft.name);
      if (!age.trim() && draft.age !== null) setAge(String(draft.age));
      if (!gender && draft.gender) setGender(draft.gender);
      if (!origin.trim()) setOrigin(draft.origin);
      if (!profession.trim()) setProfession(draft.profession);
      if (!shortBio.trim()) setShortBio(draft.shortBio);
      if (!skillPortfolio.some((skill) => skill.title.trim() || skill.description.trim())) {
        setSkillPortfolio(draft.skillPortfolio);
      }
      if (!personality.trim()) setPersonality(draft.personality);
      if (!bible.trim()) setBible(draft.bible);
      if (!greeting.trim()) setGreeting(draft.greeting);
      setGenerateNotice("Draf siap. Tinjau dan sesuaikan sebelum membuat karakter; foto tetap diunggah sendiri.");
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Gagal membuat draf karakter.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleBibleFile(file: File) {
    setError(null);
    setImported(null);

    const text = await file.text();
    const result = parseBibleFile(file.name, text);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setBible(result.data.bible);

    const filled: string[] = [];
    if (result.data.name && !name.trim()) {
      setName(result.data.name);
      filled.push("nama");
    }
    if (result.data.personality && !personality.trim()) {
      setPersonality(result.data.personality);
      filled.push("kepribadian");
    }
    if (result.data.greeting && !greeting.trim()) {
      setGreeting(result.data.greeting);
      filled.push("pesan pembuka");
    }
    if (result.data.shortBio && !shortBio.trim()) {
      setShortBio(result.data.shortBio);
      filled.push("status");
    }

    setImported(
      filled.length
        ? `Bible diimpor. Sekalian terisi: ${filled.join(", ")}.`
        : "Bible diimpor."
    );
  }

  async function handleCharacterDossierFile(file: File) {
    setDossierImportFeedback(null);
    setError(null);

    if (!file.name.toLowerCase().endsWith(".json")) {
      setDossierImportFeedback({ kind: "err", text: "Dossier karakter harus berformat .json." });
      return;
    }

    try {
      const result = parseCharacterProfileDossier(await file.text());
      if (!result.ok) {
        setDossierImportFeedback({ kind: "err", text: result.error });
        return;
      }

      const dossier = result.data;
      const currentName = name.trim();
      if (
        dossier.name &&
        currentName &&
        dossier.name.toLowerCase() !== currentName.toLowerCase()
      ) {
        setDossierImportFeedback({
          kind: "err",
          text: `Dossier ini untuk “${dossier.name}”, sedangkan formulir sedang membuka “${currentName}”.`,
        });
        return;
      }

      const replacing: string[] = [];
      if (dossier.shortBio !== undefined && shortBio.trim()) replacing.push("Status singkat");
      if (dossier.greeting !== undefined && greeting.trim()) replacing.push("Pesan pembuka");
      if (dossier.skillPortfolio !== undefined && skillPortfolio.length) {
        replacing.push("Keahlian & layanan");
      }
      if (dossier.teamRole !== undefined && teamRole.trim()) replacing.push("Peran Tim 1");
      if (dossier.sharedTeamMemory !== undefined && sharedTeamMemory.trim()) {
        replacing.push("Memori bersama Tim 1");
      }
      if (dossier.ownerRelationship !== undefined && ownerRelationship.trim()) {
        replacing.push("Hubungan dengan pemilik");
      }
      if (dossier.personality !== undefined && personality.trim()) {
        replacing.push("Kepribadian & latar belakang");
      }
      if (dossier.bible !== undefined && bible.trim()) replacing.push("Bible peran");
      if (replacing.length && !window.confirm(`Impor akan mengganti ${replacing.join(", ")} di formulir. Lanjutkan?`)) {
        return;
      }

      const importedFields: string[] = [];
      if (dossier.name && !currentName) {
        setName(dossier.name);
        importedFields.push("nama");
      }
      if (dossier.shortBio !== undefined) {
        setShortBio(dossier.shortBio);
        importedFields.push("status singkat");
      }
      if (dossier.greeting !== undefined) {
        setGreeting(dossier.greeting);
        importedFields.push("pesan pembuka");
      }
      if (dossier.skillPortfolio !== undefined) {
        setSkillPortfolio(dossier.skillPortfolio);
        importedFields.push("keahlian & layanan");
      }
      if (dossier.teamRole !== undefined) {
        setTeamRole(dossier.teamRole);
        importedFields.push("peran Tim 1");
      }
      if (dossier.sharedTeamMemory !== undefined) {
        setSharedTeamMemory(dossier.sharedTeamMemory);
        importedFields.push("Memori bersama Tim 1");
      }
      if (dossier.ownerRelationship !== undefined) {
        setOwnerRelationship(dossier.ownerRelationship);
        importedFields.push("hubungan dengan pemilik");
      }
      if (dossier.personality !== undefined) {
        setPersonality(dossier.personality);
        importedFields.push("kepribadian & latar belakang");
      }
      if (dossier.bible !== undefined) {
        setBible(dossier.bible);
        importedFields.push("Bible peran");
      }

      setDossierImportFeedback({
        kind: "ok",
        text: `Dimuat: ${importedFields.join(", ")}. Periksa hasilnya lalu simpan perubahan.`,
      });
    } catch {
      setDossierImportFeedback({ kind: "err", text: "Berkas dossier tidak dapat dibaca." });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const normalizedName = cleanCharacterName(name);
    const nameProblem = characterNameError(normalizedName);
    if (nameProblem) return setError(nameProblem);
    const duplicateName = existingNames.some((existingName) => {
      if (initial && normalizeCharacterName(existingName) === normalizeCharacterName(initial.name)) return false;
      return normalizeCharacterName(existingName) === normalizeCharacterName(normalizedName);
    });
    if (duplicateName) return setError(`Nama “${normalizedName}” sudah dipakai karakter lain di akunmu.`);
    const parsedAge = age.trim() ? Number(age) : null;
    if (parsedAge !== null && (!Number.isInteger(parsedAge) || parsedAge < MIN_CHARACTER_AGE || parsedAge > MAX_CHARACTER_AGE)) {
      return setError(`Usia karakter harus antara ${MIN_CHARACTER_AGE} dan ${MAX_CHARACTER_AGE}.`);
    }
    if (origin.length > MAX_CHARACTER_ORIGIN_CHARS) return setError(`Asal maksimal ${MAX_CHARACTER_ORIGIN_CHARS} karakter.`);
    if (profession.length > MAX_CHARACTER_PROFESSION_CHARS) return setError(`Profesi maksimal ${MAX_CHARACTER_PROFESSION_CHARS} karakter.`);
    if (!personality.trim()) return setError("Deskripsi kepribadian wajib diisi.");
    if (teamRole.length > MAX_TEAM_ROLE_CHARS) {
      return setError(`Peran Tim 1 maksimal ${MAX_TEAM_ROLE_CHARS} karakter.`);
    }
    if (sharedTeamMemory.length > MAX_SHARED_TEAM_MEMORY_CHARS) {
      return setError(`Catatan Tim 1 maksimal ${MAX_SHARED_TEAM_MEMORY_CHARS} karakter.`);
    }
    if (ownerRelationship.length > MAX_OWNER_RELATIONSHIP_CHARS) {
      return setError(`Hubungan dengan pemilik maksimal ${MAX_OWNER_RELATIONSHIP_CHARS} karakter.`);
    }
    if (bible.length > MAX_BIBLE_CHARS) {
      return setError(
        `Bible terlalu panjang: ${bible.length.toLocaleString("id-ID")} dari maksimal ${MAX_BIBLE_CHARS.toLocaleString("id-ID")} karakter.`
      );
    }
    const skillValidation = validateCharacterSkillPortfolio(skillPortfolio);
    if (!skillValidation.ok) return setError(skillValidation.error);

    setBusy(true);
    try {
      const payload = {
        name: normalizedName,
        gender,
        age: parsedAge,
        origin,
        profession,
        shortBio,
        skillPortfolio: skillValidation.skills,
        teamRole,
        sharedTeamMemory,
        ownerRelationship,
        shareTeamMemory,
        shareOwnerProfileFields,
        personality,
        bible,
        greeting,
        avatarUrl,
        providerId: providerId || null,
        model: model || null,
      };
      const res = await fetch(initial ? `/api/characters/${initial.id}` : "/api/characters", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan karakter.");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fade-in modal-overlay absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,var(--safe-top))] backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="pop-in flex max-h-[min(90dvh,100%)] min-h-0 w-full max-w-lg flex-col rounded-3xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={initial ? "Edit Karakter" : "Buat Karakter Baru"}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">
              {onboardingMode ? "Buat Karakter Pertamamu" : initial ? "Edit Karakter" : "Buat Karakter Baru"}
            </h2>
            {onboardingMode && <p className="mt-0.5 text-[11px] text-muted">Isi sendiri atau minta AI membuat draf yang bisa kamu ubah.</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 pb-6"
        >
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative rounded-full"
              title="Unggah foto profil"
            >
              <Avatar name={name || "?"} src={avatarUrl} size={88} ring />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition group-hover:bg-black/35">
                <CameraIcon className="h-6 w-6 text-white opacity-0 transition group-hover:opacity-100" />
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarPick(file);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-medium text-ink-soft transition hover:text-ink"
              >
                {uploading
                  ? "Mengunggah..."
                  : avatarUrl
                    ? "Ganti foto"
                    : "Pilih foto"}
              </button>
              {avatarUrl && (
                <>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => setCropSource(avatarUrl)}
                    className="font-medium text-ink-soft transition hover:text-ink disabled:opacity-50"
                  >
                    Atur posisi
                  </button>
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="text-ink-soft hover:text-rose-500"
                  >
                    Hapus
                  </button>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Nama Karakter</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_CHARACTER_NAME_CHARS}
              placeholder="Mis. Kirana"
              className={FIELD}
            />
            <p className="mt-1 text-[11px] text-muted">Nama unik di akunmu · {name.length}/{MAX_CHARACTER_NAME_CHARS}.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Usia (opsional)</label>
              <input
                type="number"
                min={MIN_CHARACTER_AGE}
                max={MAX_CHARACTER_AGE}
                value={age}
                onChange={(event) => setAge(event.target.value)}
                placeholder="Mis. 28"
                className={FIELD}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">
                Jenis kelamin / gender (opsional)
              </label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as Gender)}
                className={FIELD}
              >
                {GENDER_OPTIONS.map(({ value, label }) => (
                  <option key={value || "unspecified"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted">
                Untuk “Lainnya”, jelaskan di Bible bila perlu.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Asal (opsional)</label>
              <input
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                maxLength={MAX_CHARACTER_ORIGIN_CHARS}
                placeholder="Mis. Bogor"
                className={FIELD}
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-ink-soft">Profesi (opsional)</label>
                {initial && (
                  <button
                    type="button"
                    disabled={generating || !hasAiProvider}
                    onClick={() => void generateCharacterProfile(true)}
                    className="shrink-0 text-[11px] font-semibold text-ink-soft underline decoration-dotted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generating ? "AI menyusun..." : "✨ Bantu isi dengan AI"}
                  </button>
                )}
              </div>
              <input
                value={profession}
                onChange={(event) => setProfession(event.target.value)}
                maxLength={MAX_CHARACTER_PROFESSION_CHARS}
                placeholder="Mis. konsultan karier"
                className={FIELD}
              />
              {initial && (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={starterConcept}
                    onChange={(event) => setStarterConcept(event.target.value)}
                    maxLength={800}
                    placeholder="Arahan profesi baru (opsional)"
                    aria-label="Arahan profesi baru untuk AI"
                    className={FIELD}
                  />
                  {!hasAiProvider && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">Tambahkan API key terlebih dulu agar AI bisa membantu.</p>
                  )}
                  {generateNotice && <p aria-live="polite" className="text-[11px] text-emerald-700 dark:text-emerald-300">{generateNotice}</p>}
                  {generateError && <p role="alert" className="text-[11px] text-rose-600 dark:text-rose-400">{generateError}</p>}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Status singkat (tampil di bawah nama)
            </label>
            <input
              value={shortBio}
              onChange={(e) => setShortBio(e.target.value)}
              placeholder="Mis. beauty talent · AK Talent"
              className={FIELD}
            />
            <p className="mt-1 text-[11px]">{charCount(shortBio, MAX_SHORT_BIO_CHARS)}</p>
          </div>

          <div className={`${onboardingMode ? "hidden " : ""}space-y-2.5 rounded-2xl border border-line bg-surface-2/70 p-3.5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink">Impor dossier karakter</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                  Satu berkas JSON per karakter; boleh memuat Bible, kepribadian, portofolio,
                  hubungan dengan pemilik, dan konteks tim. Field yang tidak ada tetap. Izin berbagi
                  Tim 1 tidak diubah. Tinjau hasilnya sebelum menyimpan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => dossierFileRef.current?.click()}
                className="shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-semibold text-ink transition hover:bg-surface-2"
              >
                Pilih JSON
              </button>
              <input
                ref={dossierFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleCharacterDossierFile(file);
                  event.target.value = "";
                }}
              />
            </div>
            <details className="rounded-xl bg-surface px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-ink-soft">
                Contoh format dossier
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-muted">{`{
  "name": "Nama karakter (harus cocok)",
  "shortBio": "Status singkat",
  "greeting": "Pesan pembuka",
  "skillPortfolio": [
    { "title": "Nama keahlian", "description": "Layanan yang ditawarkan" }
  ],
  "teamRole": "Peran di Tim 1",
  "sharedTeamMemory": "Relasi dan konteks bersama",
  "ownerRelationship": "Hubungan khusus dengan pemilik akun",
  "personality": "Kepribadian dan latar belakang",
  "bible": "Teks Bible lengkap"
}`}</pre>
            </details>
            {dossierImportFeedback && (
              <p
                aria-live="polite"
                className={`rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
                  dossierImportFeedback.kind === "ok"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                }`}
              >
                {dossierImportFeedback.kind === "ok" ? "✓ " : "✗ "}
                {dossierImportFeedback.text}
              </p>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-line bg-surface-2/70 p-3.5">
            <div>
              <p className="text-xs font-semibold text-ink">Keahlian & layanan</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                Atur hal yang bisa dibantu karakter ini. Contoh: Musthzen—IT & produksi, Arissa—menulis & analisis, Kirana—komunikasi & bisnis. Portofolio tampil di pratinjau undangan dan menjadi konteks saat ia berbicara; ini bukan klaim sertifikasi atau izin otomatis memakai alat.
              </p>
            </div>
            {skillPortfolio.map((skill, index) => (
              <div key={index} className="space-y-2 rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-ink-soft">
                    Keahlian {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSkillPortfolio((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`Hapus keahlian ${index + 1}`}
                    className="rounded-full p-1 text-muted transition hover:bg-surface-2 hover:text-ink"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={skill.title}
                  onChange={(event) =>
                    setSkillPortfolio((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, title: event.target.value } : item
                      )
                    )
                  }
                  placeholder="Mis. IT infrastructure & support"
                  maxLength={MAX_SKILL_TITLE_CHARS}
                  aria-label={`Nama keahlian ${index + 1}`}
                  className={FIELD}
                />
                <textarea
                  value={skill.description}
                  onChange={(event) =>
                    setSkillPortfolio((prev) =>
                      prev.map((item, i) =>
                        i === index ? { ...item, description: event.target.value } : item
                      )
                    )
                  }
                  placeholder="Mis. Dukungan jaringan, server, dan troubleshooting perangkat."
                  maxLength={MAX_SKILL_DESCRIPTION_CHARS}
                  rows={2}
                  aria-label={`Deskripsi keahlian ${index + 1}`}
                  className={`${FIELD} resize-none`}
                />
              </div>
            ))}
            <button
              type="button"
              disabled={skillPortfolio.length >= MAX_CHARACTER_SKILLS}
              onClick={() => setSkillPortfolio((prev) => [...prev, { title: "", description: "" }])}
              className="w-full rounded-xl border border-dashed border-line px-3 py-2 text-xs font-semibold text-ink-soft transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Tambah keahlian ({skillPortfolio.length}/{MAX_CHARACTER_SKILLS})
            </button>
          </div>

          {!initial && (
            <section className="space-y-3 rounded-2xl border border-brand/20 bg-brand/5 p-3.5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Buat draf dengan AI</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                  Pilih arah karakter. AI mengisi field teks yang masih kosong, termasuk Bible, kepribadian, keahlian, dan sapaan; isianmu yang sudah ada tidak ditimpa.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Gaya awal</label>
                <select
                  value={starterArchetype}
                  onChange={(event) => setStarterArchetype(event.target.value as CharacterStarterArchetype)}
                  className={FIELD}
                >
                  {CHARACTER_STARTER_ARCHETYPES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted">
                  {CHARACTER_STARTER_ARCHETYPES.find((item) => item.id === starterArchetype)?.description}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Arahan tambahan (opsional)</label>
                <textarea
                  value={starterConcept}
                  onChange={(event) => setStarterConcept(event.target.value)}
                  rows={2}
                  maxLength={800}
                  placeholder="Mis. suka kopi, humor receh, bicaranya hangat tapi blak-blakan."
                  className={`${FIELD} resize-none`}
                />
              </div>
              <button
                type="button"
                disabled={generating || !hasAiProvider}
                onClick={() => void generateCharacterProfile()}
                className="w-full rounded-xl border border-brand/30 bg-surface px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? "AI sedang menyusun draf..." : "✨ Isi field kosong dengan AI"}
              </button>
              {!hasAiProvider && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">Tambahkan API key terlebih dulu agar AI bisa membuat draf.</p>
              )}
              {generateNotice && <p className="text-xs text-emerald-700 dark:text-emerald-300">{generateNotice}</p>}
              {generateError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{generateError}</p>}
            </section>
          )}

          <div className={`${onboardingMode ? "hidden " : ""}space-y-2 rounded-2xl border border-line bg-surface-2/70 p-3.5`}>
            <div>
              <label className="block text-xs font-semibold text-ink">
                Hubungan dengan pemilik
              </label>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                Jelaskan hubungan khusus karakter ini denganmu. Hanya dipakai saat pemilik akun berbicara dengan karakter ini; tidak masuk Memori Tim 1 atau sesi undangan. Selaraskan dengan Bible dan jangan masukkan hal sensitif yang tak ingin diproses model.
              </p>
            </div>
            <textarea
              value={ownerRelationship}
              onChange={(event) => setOwnerRelationship(event.target.value)}
              placeholder="Mis. Pemilikmu adalah kawan dekat sekaligus partner kreatif. Kamu tetap mandiri, dan ide personalmu tetap privat kecuali kamu setuju membagikannya."
              maxLength={MAX_OWNER_RELATIONSHIP_CHARS}
              rows={3}
              aria-label="Hubungan dengan pemilik"
              className={`${FIELD} resize-none`}
            />
            <p className="text-[11px]">{charCount(ownerRelationship, MAX_OWNER_RELATIONSHIP_CHARS)}</p>
          </div>

          <div className={`${onboardingMode ? "hidden " : ""}space-y-3 rounded-2xl border border-line bg-surface-2/70 p-3.5`}>
            <div>
              <p className="text-xs font-semibold text-ink">Memori Tim 1</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                Semua karakter di akunmu masuk Tim 1 secara default. Catatan relasi yang dibagikan membantu mereka saling mengenal.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Peran di tim</label>
              <input
                value={teamRole}
                onChange={(e) => setTeamRole(e.target.value)}
                placeholder="Mis. koordinator talent"
                maxLength={MAX_TEAM_ROLE_CHARS}
                className={FIELD}
              />
              <p className="mt-1 text-[11px]">{charCount(teamRole, MAX_TEAM_ROLE_CHARS)}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">
                Memori bersama & relasi Tim 1
              </label>
              <textarea
                value={sharedTeamMemory}
                onChange={(e) => setSharedTeamMemory(e.target.value)}
                placeholder="Mis. Alya adalah rekan dekat Dimas; Dimas senior di tim dan sering membantu Alya saat syuting."
                maxLength={MAX_SHARED_TEAM_MEMORY_CHARS}
                rows={3}
                className={`${FIELD} resize-none`}
              />
              <p className="mt-1 text-[11px]">
                {charCount(sharedTeamMemory, MAX_SHARED_TEAM_MEMORY_CHARS)}
              </p>
            </div>
            <label className="flex items-start gap-2 text-xs text-ink-soft">
              <input
                type="checkbox"
                checked={shareTeamMemory}
                onChange={(e) => setShareTeamMemory(e.target.checked)}
                className="mt-0.5 accent-ink"
              />
              <span>
                Boleh bawa konteks Tim 1 saat karakter ini diundang pengguna lain.
              </span>
            </label>
            <p className="text-[11px] leading-relaxed text-muted">
              Riwayat chat, Buku Ingatan pribadi, dan Papan Catatan & Janji tetap milik masing-masing pengguna dan tidak ikut dibagikan.
            </p>
          </div>

          <div className={`${onboardingMode ? "hidden " : ""}space-y-3 rounded-2xl border border-line bg-surface-2/70 p-3.5`}>
            <div>
              <p className="text-xs font-semibold text-ink">Info profil pemilik saat diundang</p>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                Karakter tetap tahu bahwa ia milikmu dan hadir sebagai tamu. Centang hanya fakta profilmu yang boleh masuk ke brief dan dibagikan saat ia diundang.
              </p>
            </div>
            <div className="space-y-2">
              {OWNER_PROFILE_SHARE_OPTIONS.map(({ field, label }) => (
                <label key={field} className="flex items-center gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={shareOwnerProfileFields.includes(field)}
                    onChange={(event) => {
                      setShareOwnerProfileFields((prev) =>
                        event.target.checked
                          ? [...prev, field]
                          : prev.filter((item) => item !== field)
                      );
                    }}
                    className="accent-ink"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              Yang tidak dicentang tidak dimasukkan dari profil akunmu. Riwayat chat, Buku Ingatan pribadi, dan Papan Catatan & Janji tetap privat. Izin Tim 1 diatur terpisah di atas.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Kepribadian & latar belakang karakter
            </label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder={PERSONALITY_PLACEHOLDER}
              rows={5}
              className={`${FIELD} resize-none`}
            />
            <p className="mt-1 text-[11px]">{charCount(personality, MAX_PERSONALITY_CHARS)}</p>
          </div>

          <div className="rounded-2xl border border-line bg-surface-2/70 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-ink">
                📖 Bible peran (acuan utama)
              </label>
              <button
                type="button"
                onClick={() => bibleFileRef.current?.click()}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[11px] font-semibold text-ink transition hover:bg-surface-2"
              >
                Impor berkas
              </button>
              <input
                ref={bibleFileRef}
                type="file"
                accept=".txt,.md,.markdown,.json,text/plain,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBibleFile(file);
                  e.target.value = "";
                }}
              />
            </div>
            <textarea
              value={bible}
              onChange={(e) => setBible(e.target.value)}
              placeholder={BIBLE_PLACEHOLDER}
              rows={6}
              className={`${FIELD} resize-none`}
            />
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted">
                .txt / .md / .json — kalau kosong, cukup pakai kepribadian di atas.
              </span>
              {charCount(bible, MAX_BIBLE_CHARS)}
            </div>
            {imported && <p className="mt-1 text-[11px] font-medium text-ink">{imported}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">
              Pesan pembuka pertama (opsional)
            </label>
            <textarea
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Mis. eh halo, gimana hari ini?"
              rows={2}
              className={`${FIELD} resize-none`}
            />
          </div>

          <div className={`${onboardingMode ? "hidden " : ""}grid grid-cols-1 gap-2 sm:grid-cols-2`}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Provider AI</label>
              <select
                value={providerId}
                onChange={(e) => {
                  setProviderId(e.target.value);
                  setDetectedModels([]);
                  setDetectError(null);
                }}
                className={FIELD}
              >
                <option value="">Gunakan default</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-ink-soft">
                  Model (opsional)
                </label>
                {providers.length > 0 && (
                  <button
                    type="button"
                    disabled={detectingModels}
                    onClick={() => void detectCharacterModels()}
                    className="text-[11px] font-semibold text-ink-soft underline decoration-dotted hover:text-ink disabled:opacity-50"
                  >
                    {detectingModels ? "Mendeteksi..." : "Deteksi tersedia"}
                  </button>
                )}
              </div>
              <input
                value={model ?? ""}
                onChange={(e) => setModel(e.target.value)}
                placeholder={
                  resolvedProvider?.model
                    ? `Ikut provider (${resolvedProvider.model})`
                    : "Kosongkan = ikut provider"
                }
                className={FIELD}
              />
            </div>
          </div>

          {detectError && (
            <p className="text-xs text-rose-600 dark:text-rose-400">{detectError}</p>
          )}

          {detectedModels.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] text-muted">
                Model tersedia saat ini (ketuk untuk memilih, atau kosongkan agar ikut provider):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {model.trim() && (
                  <button
                    type="button"
                    onClick={() => setModel("")}
                    className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft transition hover:text-ink"
                  >
                    Ikut provider
                  </button>
                )}
                {detectedModels.map((m) => {
                  const active = model === m;
                  return (
                    <button
                      type="button"
                      key={m}
                      onClick={() => setModel(m)}
                      className={`rounded-full px-2.5 py-1 text-xs transition ${
                        active
                          ? "bg-brand font-semibold text-brand-ink"
                          : "bg-surface-2 text-ink-soft hover:text-ink"
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={busy || generating || uploading}
            className="w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-brand-ink transition hover:bg-brand-strong active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? "Menyimpan..." : initial ? "Simpan Perubahan" : "Buat Karakter"}
          </button>
        </form>
      </div>

      {cropSource && (
        <AvatarCropModal
          source={cropSource}
          title="Atur Foto Karakter"
          busy={uploading}
          error={error}
          onCancel={() => setCropSource(null)}
          onConfirm={uploadCroppedAvatar}
          onPickAnother={() => fileRef.current?.click()}
        />
      )}
    </div>
  );
}
