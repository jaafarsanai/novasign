import React from "react";
import { useParams } from "react-router-dom";
import VirtualScreenPage from "../virtual-screen/VirtualScreenPage";

export default function PlayerPage() {
  const { code } = useParams();
  const pairingCode = String(code ?? "").trim().toUpperCase();

  return <VirtualScreenPage embed pairingCode={pairingCode} />;
}