          {/* Squeeze Momentum Toggle Button */}
          <button
            onClick={() => setShowSqueezeSettings(true)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              sqzSettings.settings.enabled
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700'
            }`}
            title="Squeeze Momentum (LazyBear)"
            data-testid="btn-squeeze-momentum-toggle"
          >
            Squeeze
          </button>

          {/* Volume Profile Button */}
          <button
            onClick={() => setShowVPModal(true)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
              vpSettings.settings.enabled
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800/90 text-gray-400 hover:bg-slate-700'
            }`}
            title="Volume Profile Settings"
            data-testid="btn-volume-profile"
          >
            VP
          </button>
        </div>
