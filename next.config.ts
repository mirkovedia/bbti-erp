import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empaqueta un server.js autocontenido para la imagen Docker (etapa runner).
  output: "standalone",
};

export default nextConfig;
