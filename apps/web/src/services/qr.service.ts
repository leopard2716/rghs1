import QRCode from "qrcode";

export async function createTotpQrCode({
  secret,
  issuer,
  accountName
}: {
  secret: string;
  issuer: string;
  accountName: string;
}): Promise<{ qrCode: string; uri: string }> {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30"
  });
  const uri = `otpauth://totp/${encodeURIComponent(accountName)}?${params.toString()}`;
  const qrCode = await QRCode.toString(uri, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2
  });

  return {
    qrCode,
    uri
  };
}
