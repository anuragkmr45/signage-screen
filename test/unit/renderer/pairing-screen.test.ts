const { expect } = require('chai')

describe('Pairing screen view model', () => {
  function resolve(status, options = {}) {
    const { resolveKioskSurfaceView } = require('../../../src/renderer/pairing.ts')
    return resolveKioskSurfaceView(
      {
        state: 'BOOT',
        mode: 'empty',
        online: false,
        ...status,
      },
      {
        landingElapsed: true,
        runtimeMode: 'production',
        ...options,
      }
    )
  }

  it('shows the branded landing view before the fixed landing delay completes', () => {
    const { LANDING_DURATION_MS } = require('../../../src/renderer/pairing.ts')

    const view = resolve(
      {
        state: 'PAIRING_PENDING',
        pairingCode: 'ABC123',
      },
      {
        landingElapsed: false,
      }
    )

    expect(LANDING_DURATION_MS).to.equal(3000)
    expect(view.kind).to.equal('landing')
    expect(view.fullScreen).to.equal(true)
    expect(view.title).to.equal('HexmonSignage Player')
    expect(view.message).to.equal('Preparing this screen for service.')
  })

  it('shows the pairing code view after landing when a code is available', () => {
    const view = resolve({
      state: 'PAIRING_PENDING',
      pairingCode: 'ABC123',
      pairingExpiresAt: new Date(Date.now() + 60000).toISOString(),
    })

    expect(view.kind).to.equal('pairing')
    expect(view.fullScreen).to.equal(true)
    expect(view.title).to.equal('Connect this screen')
    expect(view.showPairingCode).to.equal(true)
  })

  it('shows a full-screen friendly service message when no content or pairing code is available', () => {
    const view = resolve({
      state: 'HARD_RECOVERY',
      backendAvailable: false,
      mode: 'empty',
    })

    expect(view.kind).to.equal('backend-unavailable')
    expect(view.fullScreen).to.equal(true)
    expect(view.title).to.equal('Service connection unavailable')
    expect(view.message).to.include('It will keep trying automatically')
    expect(view.message).to.not.include('ECONNREFUSED')
  })

  it('uses a discreet notice when backend is down but playback can continue', () => {
    const view = resolve({
      state: 'SOFT_RECOVERY',
      backendAvailable: false,
      mode: 'offline',
    })

    expect(view.kind).to.equal('discreet-backend')
    expect(view.fullScreen).to.equal(false)
    expect(view.showDiscreetConnectivityNotice).to.equal(true)
  })

  it('shows setup-required copy instead of raw configuration validation details', () => {
    const view = resolve({
      state: 'BOOT',
      backendAvailable: false,
      error:
        'Configuration required: apiBase is required for qa/production. Configure the backend IP, for example http://10.20.0.20:3000',
    })

    expect(view.kind).to.equal('setup-required')
    expect(view.title).to.equal('Setup required')
    expect(view.message).to.equal(
      'This screen needs a service address before it can be connected. Please contact your administrator.'
    )
    expect(view.message).to.not.include('apiBase')
  })

  it('keeps interactive controls available only in dev mode', () => {
    const qaView = resolve(
      {
        state: 'PAIRING_PENDING',
        pairingCode: 'ABC123',
      },
      {
        runtimeMode: 'qa',
      }
    )
    const devView = resolve(
      {
        state: 'PAIRING_PENDING',
        pairingCode: 'ABC123',
      },
      {
        runtimeMode: 'dev',
      }
    )

    expect(qaView.showDeveloperControls).to.equal(false)
    expect(devView.showDeveloperControls).to.equal(true)
  })
})
