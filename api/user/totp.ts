/**
 * TOTP (Time-based One-Time Password) generation
 */
import {
  successResponse,
  inputError,
  dbError,
  checkMethod,
} from "../_shared/responses";

/**
 * Decode base32 encoded string to Uint8Array
 * @param secret - Base32 encoded string
 * @returns Decoded bytes
 */
function base32Decode(secret: string): Uint8Array {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleanSecret = secret.toUpperCase().replace(/=+$/, "");
  let bits = "";

  for (const char of cleanSecret) {
    const val = base32Chars.indexOf(char);
    if (val === -1) throw new Error("Invalid base32 character");
    bits += val.toString(2).padStart(5, "0");
  }

  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  return bytes;
}

/**
 * Generate HMAC-SHA1 hash
 * @param key - Secret key
 * @param message - Message to hash
 * @returns HMAC-SHA1 hash
 */
async function hmacSha1(
  key: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  // @ts-expect-error - Bun's crypto types are slightly different
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  // @ts-expect-error - Bun's crypto types are slightly different
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

/**
 * Generate TOTP value from secret (Async version)
 * @param totpSecret - Base32 encoded TOTP secret
 * @param timeStep - Time step in seconds (default: 30)
 * @returns 6-digit TOTP code
 */
export async function generateTotpValue(
  totpSecret: string,
  timeStep: number = 30
): Promise<string> {
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);

  // Convert counter to 8-byte array (big-endian)
  const counterBytes = new Uint8Array(8);
  let tempCounter = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = tempCounter & 0xff;
    tempCounter = Math.floor(tempCounter / 256);
  }

  const key = base32Decode(totpSecret);
  const hash = await hmacSha1(key, counterBytes);

  // Dynamic truncation
  const offset = (hash[hash.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hash[offset] ?? 0) & 0x7f) << 24) |
    (((hash[offset + 1] ?? 0) & 0xff) << 16) |
    (((hash[offset + 2] ?? 0) & 0xff) << 8) |
    ((hash[offset + 3] ?? 0) & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * Handle TOTP generation
 */
export async function handleTotp(req: Request): Promise<Response> {
  try {
    // Check HTTP method
    const methodError = checkMethod(req, "POST");
    if (methodError) return methodError;

    // Parse form-encoded data
    const contentType = req.headers.get("content-type");
    if (!contentType?.includes("application/x-www-form-urlencoded")) {
      return inputError(
        "Content-Type must be application/x-www-form-urlencoded"
      );
    }

    const formData = await req.formData();
    const totp_secret = formData.get("totp_secret")?.toString();

    // Validate required field
    if (!totp_secret) {
      return inputError("totp_secret is required");
    }

    // Generate TOTP value
    let totpValue: string;
    try {
      totpValue = await generateTotpValue(totp_secret);
    } catch (error) {
      console.error("Error generating TOTP value:", error);
      return inputError(
        "Invalid TOTP secret format. Must be a valid base32 encoded string."
      );
    }

    return successResponse({
      message: "TOTP generated successfully",
      totp_value: totpValue,
    });
  } catch (error) {
    console.error("Error in TOTP handler:", error);
    return dbError(
      error instanceof Error ? error.message : "Internal server error"
    );
  }
}
