import { apiError } from "../../errors";

const maxResumeSizeBytes = 5 * 1024 * 1024;

export type ResumeUploadInput = {
  file: File;
  workspaceId: string;
  profileId: string;
  actorMemberId: string;
  bucket: R2Bucket;
};

export class ResumeUploadService {
  async upload(input: ResumeUploadInput) {
    if (input.file.size > maxResumeSizeBytes) {
      throw apiError(413, "Resume uploads are limited to 5 MB.", "resume_too_large");
    }

    const fileId = crypto.randomUUID();
    const storageKey = `${input.workspaceId}/profiles/${input.profileId}/resumes/${fileId}-${input.file.name}`;

    await input.bucket.put(storageKey, input.file.stream(), {
      httpMetadata: {
        contentType: input.file.type || "application/octet-stream"
      },
      customMetadata: {
        workspaceId: input.workspaceId,
        profileId: input.profileId,
        uploadedByMemberId: input.actorMemberId
      }
    });

    return {
      id: fileId,
      workspaceId: input.workspaceId,
      profileId: input.profileId,
      storageKey,
      originalName: input.file.name,
      mimeType: input.file.type,
      sizeBytes: input.file.size
    };
  }
}
