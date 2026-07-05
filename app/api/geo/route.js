import { countryCode, langForCountry } from "@/lib/geo";

export async function GET(req) {
  const cc = await countryCode(req);
  return Response.json({ cn: cc === "CN", country: cc || null, lang: langForCountry(cc) });
}
