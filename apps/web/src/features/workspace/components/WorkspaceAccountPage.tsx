import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  Camera,
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound
} from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PasswordInput } from "../../../components/shared/PasswordInput";
import { errorMessage } from "../../../errors";
import {
  updateAuthenticatedPassword,
  verifyPassword,
  type AuthSession
} from "../../../services/auth.service";
import {
  deleteWorkspaceAvatar,
  fetchWorkspaceAccount,
  fetchWorkspaceAvatar,
  updateWorkspaceAccount,
  uploadWorkspaceAvatar,
  type WorkspaceAccount,
  type WorkspaceSession
} from "../../../services/workspace.service";
import { fieldValue } from "../../../utils/form";
import { WorkspaceShell } from "./WorkspaceShell";

export function WorkspaceAccountPage({
  session,
  workspaceSession,
  onRecoverPassword,
  onSignOut
}: {
  session: AuthSession;
  workspaceSession: WorkspaceSession;
  onRecoverPassword: () => void;
  onSignOut: () => void;
}) {
  const queryClient = useQueryClient();
  const slug = workspaceSession.workspace.slug;
  const memberId = workspaceSession.member.id;
  const accountQueryKey = useMemo(() => ["workspace-account", slug, memberId], [memberId, slug]);
  const accountQuery = useQuery({
    queryKey: accountQueryKey,
    queryFn: () => fetchWorkspaceAccount(session, slug)
  });
  const account = accountQuery.data ?? accountFromSession(workspaceSession);
  const [displayName, setDisplayName] = useState(account.member.displayName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(account.member.displayName);
  }, [account.member.displayName]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setAvatarError(null);

    if (!account.member.avatarUpdatedAt) {
      setAvatarUrl(null);
      return () => undefined;
    }

    void fetchWorkspaceAvatar(session, slug)
      .then((blob) => {
        if (!active || !blob) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setAvatarUrl(objectUrl);
      })
      .catch((error) => {
        if (active) {
          setAvatarError(errorMessage(error));
        }
      });

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [account.member.avatarUpdatedAt, session, slug]);

  const nameMutation = useMutation({
    mutationFn: (nextDisplayName: string) =>
      updateWorkspaceAccount(session, slug, { displayName: nextDisplayName }),
    onSuccess: (data) => refreshAccountData(queryClient, slug, accountQueryKey, data)
  });
  const avatarUploadMutation = useMutation({
    mutationFn: (file: Blob) => uploadWorkspaceAvatar(session, slug, file),
    onSuccess: (data) => refreshAccountData(queryClient, slug, accountQueryKey, data)
  });
  const avatarDeleteMutation = useMutation({
    mutationFn: () => deleteWorkspaceAvatar(session, slug),
    onSuccess: (data) => refreshAccountData(queryClient, slug, accountQueryKey, data)
  });

  function handleNameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    nameMutation.mutate(displayName.trim());
  }

  return (
    <WorkspaceShell
      session={session}
      workspaceSession={workspaceSession}
      view="account"
      onRecoverPassword={onRecoverPassword}
      onSignOut={onSignOut}
    >
      <div className="account-profile-layout">
        <section className="panel account-profile-panel" aria-labelledby="account-profile-title">
          <div className="panel-header">
            <div>
              <UserRound aria-hidden="true" />
              <h3 id="account-profile-title">Tenant profile</h3>
            </div>
          </div>

          {accountQuery.isError ? (
            <p className="form-error">{errorMessage(accountQuery.error)}</p>
          ) : null}

          <AvatarEditor
            avatarUrl={avatarUrl}
            avatarVersion={account.member.avatarUpdatedAt}
            displayName={account.member.displayName}
            hasAvatar={Boolean(account.member.avatarUpdatedAt)}
            isDeleting={avatarDeleteMutation.isPending}
            isUploading={avatarUploadMutation.isPending}
            onDelete={() => avatarDeleteMutation.mutate()}
            onUpload={(file) => avatarUploadMutation.mutate(file)}
          />
          {avatarError ? <p className="form-error">{avatarError}</p> : null}
          {avatarUploadMutation.isError ? (
            <p className="form-error">{errorMessage(avatarUploadMutation.error)}</p>
          ) : null}
          {avatarDeleteMutation.isError ? (
            <p className="form-error">{errorMessage(avatarDeleteMutation.error)}</p>
          ) : null}

          <form className="modal-form admin-create-form" onSubmit={handleNameSubmit}>
            <label>
              Display name
              <input
                name="displayName"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            {nameMutation.isError ? (
              <p className="form-error">{errorMessage(nameMutation.error)}</p>
            ) : null}
            {nameMutation.isSuccess ? <p className="form-success">Profile saved.</p> : null}
            <button className="primary-action" type="submit" disabled={nameMutation.isPending}>
              {nameMutation.isPending ? (
                <LoaderCircle className="spin-icon" aria-hidden="true" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {nameMutation.isPending ? "Saving" : "Save name"}
            </button>
          </form>
        </section>

        <PasswordChangePanel session={session} />
      </div>
    </WorkspaceShell>
  );
}

function AvatarEditor({
  avatarUrl,
  avatarVersion,
  displayName,
  hasAvatar,
  isDeleting,
  isUploading,
  onDelete,
  onUpload
}: {
  avatarUrl: string | null;
  avatarVersion: string | null;
  displayName: string;
  hasAvatar: boolean;
  isDeleting: boolean;
  isUploading: boolean;
  onDelete: () => void;
  onUpload: (file: Blob) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);
  const previousAvatarVersion = useRef(avatarVersion);

  useEffect(() => {
    return () => {
      if (sourceUrl) {
        URL.revokeObjectURL(sourceUrl);
      }
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (previousAvatarVersion.current === avatarVersion) {
      return;
    }

    previousAvatarVersion.current = avatarVersion;
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }
    setSourceUrl(null);
    setFileName("");
    setImageLoaded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [avatarVersion, sourceUrl]);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas || !imageLoaded) {
      return;
    }

    drawAvatarCrop(canvas, image, cropX, cropY, zoom, 256);
  }, [cropX, cropY, imageLoaded, sourceUrl, zoom]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLocalError("Upload a PNG, JPEG, or WebP image.");
      return;
    }

    setLocalError(null);
    setImageLoaded(false);
    setCropX(50);
    setCropY(50);
    setZoom(1);
    setFileName(file.name);
    setSourceUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
  }

  async function handleUpload() {
    const image = imageRef.current;
    if (!image || !imageLoaded) {
      setLocalError("Choose an image before uploading.");
      return;
    }

    const canvas = document.createElement("canvas");
    drawAvatarCrop(canvas, image, cropX, cropY, zoom, 512);
    const blob = await canvasBlob(canvas);
    onUpload(blob);
  }

  function handleCancelCrop() {
    if (sourceUrl) {
      URL.revokeObjectURL(sourceUrl);
    }
    setSourceUrl(null);
    setFileName("");
    setImageLoaded(false);
    setLocalError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="avatar-editor">
      <div className="avatar-preview" aria-label="Avatar preview">
        {sourceUrl ? (
          <>
            <canvas ref={canvasRef} width={256} height={256} />
            <img ref={imageRef} src={sourceUrl} alt="" hidden onLoad={() => setImageLoaded(true)} />
          </>
        ) : avatarUrl ? (
          <img src={avatarUrl} alt="" />
        ) : (
          <span>{initials || <Camera aria-hidden="true" />}</span>
        )}
      </div>

      <div className="avatar-controls">
        <input
          className="avatar-file-input"
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
        />
        {sourceUrl ? (
          <>
            <div className="avatar-crop-grid">
              <label>
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
              <label>
                Horizontal
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cropX}
                  onChange={(event) => setCropX(Number(event.target.value))}
                />
              </label>
              <label>
                Vertical
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cropY}
                  onChange={(event) => setCropY(Number(event.target.value))}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="primary-action"
                type="button"
                disabled={isUploading || !imageLoaded}
                onClick={() => void handleUpload()}
              >
                {isUploading ? (
                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                {isUploading ? "Uploading" : "Upload crop"}
              </button>
              <button className="secondary-action" type="button" onClick={handleCancelCrop}>
                Cancel
              </button>
            </div>
            {fileName ? <small>Selected: {fileName}</small> : null}
          </>
        ) : (
          <div className="modal-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus aria-hidden="true" />
              Choose image
            </button>
            {hasAvatar ? (
              <button
                className="secondary-action danger-action"
                type="button"
                disabled={isDeleting}
                onClick={onDelete}
              >
                {isDeleting ? (
                  <LoaderCircle className="spin-icon" aria-hidden="true" />
                ) : (
                  <Trash2 aria-hidden="true" />
                )}
                {isDeleting ? "Removing" : "Remove avatar"}
              </button>
            ) : null}
          </div>
        )}
        {localError ? <p className="form-error">{localError}</p> : null}
      </div>
    </div>
  );
}

function PasswordChangePanel({ session }: { session: AuthSession }) {
  const formRef = useRef<HTMLFormElement>(null);
  const mutation = useMutation({
    mutationFn: async ({
      currentPassword,
      password,
      confirmPassword
    }: {
      currentPassword: string;
      password: string;
      confirmPassword: string;
    }) => {
      if (password.length < 12) {
        throw new Error("Use at least 12 characters.");
      }

      if (password !== confirmPassword) {
        throw new Error("Passwords do not match.");
      }

      if (currentPassword === password) {
        throw new Error("Use a password different from the original password.");
      }

      if (!session.user.email) {
        throw new Error("The signed-in account email is unavailable.");
      }

      await verifyPassword(session.user.email, currentPassword);
      await updateAuthenticatedPassword(session, password);
    },
    onSuccess: () => {
      formRef.current?.reset();
    }
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      currentPassword: fieldValue(form, "currentPassword"),
      password: fieldValue(form, "password"),
      confirmPassword: fieldValue(form, "confirmPassword")
    });
  }

  return (
    <section className="panel account-profile-panel" aria-labelledby="account-password-title">
      <div className="panel-header">
        <div>
          <KeyRound aria-hidden="true" />
          <h3 id="account-password-title">Password</h3>
        </div>
      </div>
      <form ref={formRef} className="modal-form admin-create-form" onSubmit={handleSubmit}>
        <label>
          Original password
          <PasswordInput name="currentPassword" required autoComplete="current-password" />
        </label>
        <label>
          New password
          <PasswordInput name="password" required minLength={12} autoComplete="new-password" />
        </label>
        <label>
          Confirm password
          <PasswordInput
            name="confirmPassword"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        {mutation.isError ? <p className="form-error">{errorMessage(mutation.error)}</p> : null}
        {mutation.isSuccess ? <p className="form-success">Password updated.</p> : null}
        <button className="primary-action" type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <LoaderCircle className="spin-icon" aria-hidden="true" />
          ) : (
            <ShieldCheck aria-hidden="true" />
          )}
          {mutation.isPending ? "Saving" : "Update password"}
        </button>
      </form>
    </section>
  );
}

async function refreshAccountData(
  queryClient: QueryClient,
  slug: string,
  accountQueryKey: readonly unknown[],
  account: WorkspaceAccount
): Promise<void> {
  queryClient.setQueryData(accountQueryKey, account);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["workspace-account", slug] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-membership", slug] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-session", slug] }),
    queryClient.invalidateQueries({ queryKey: ["workspace-members", slug] })
  ]);
}

function accountFromSession(workspaceSession: WorkspaceSession): WorkspaceAccount {
  return {
    workspace: {
      id: workspaceSession.workspace.id,
      name: workspaceSession.workspace.name,
      slug: workspaceSession.workspace.slug
    },
    member: {
      id: workspaceSession.member.id,
      email: workspaceSession.member.email,
      displayName: workspaceSession.member.displayName,
      status: workspaceSession.member.status,
      avatarUpdatedAt: workspaceSession.member.avatarUpdatedAt,
      avatarMimeType: workspaceSession.member.avatarMimeType
    }
  };
}

function drawAvatarCrop(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  cropX: number,
  cropY: number,
  zoom: number,
  size: number
) {
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context || !image.naturalWidth || !image.naturalHeight) {
    return;
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  const centerX = clamp(
    (cropX / 100) * image.naturalWidth,
    sourceSize / 2,
    image.naturalWidth - sourceSize / 2
  );
  const centerY = clamp(
    (cropY / 100) * image.naturalHeight,
    sourceSize / 2,
    image.naturalHeight - sourceSize / 2
  );
  context.clearRect(0, 0, size, size);
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    centerX - sourceSize / 2,
    centerY - sourceSize / 2,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size
  );
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Avatar crop failed."));
    }, "image/png");
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
