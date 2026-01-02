// src/pages/PlaceholderPage.tsx
import React from 'react';

interface Props {
  title: string;
  subtitle?: string;
}

const PlaceholderPage: React.FC<Props> = ({ title, subtitle }) => {
  return (
    <div>
      <h1 className="page-title">{title}</h1>
      {subtitle && <p className="page-subtitle">{subtitle}</p>}

      <div
        style={{
          marginTop: 8,
          borderRadius: 16,
          border: '1px dashed #d1d5db',
          background: '#ffffff',
          padding: 32,
          textAlign: 'center',
          fontSize: 14,
          color: '#6b7280',
        }}
      >
        This section is not implemented yet.
        <br />
        You can already manage your screens from the <b>Screens</b> tab.
      </div>
    </div>
  );
};

export default PlaceholderPage;

