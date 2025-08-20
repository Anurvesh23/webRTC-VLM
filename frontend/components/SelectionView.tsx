import React from 'react';
import { Link } from 'react-router-dom';

const SelectionView = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <header className="mb-10">
        <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight">
          WebRTC VLM Demo
        </h1>
        <p className="text-lg text-gray-400 mt-2">
          Choose Your Role
        </p>
      </header>
      
      <div className="flex flex-col md:flex-row gap-6">
        <Link
          to="/desktop"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition-transform transform hover:scale-105"
        >
          Receive Camera Feed (Desktop)
        </Link>
        
        <Link
          to="/phone"
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-xl transition-transform transform hover:scale-105"
        >
          Send Camera Feed (Phone)
        </Link>
      </div>
    </div>
  );
};

export default SelectionView;