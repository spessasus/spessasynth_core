/**
 * @param channel {number}
 * @this {Synthesizer}
 */
export function disableAndLockVibrato(channel)
{
    this.workletProcessorChannels[channel].lockVibrato = true;
    this.workletProcessorChannels[channel].channelVibrato.rate = 0;
    this.workletProcessorChannels[channel].channelVibrato.delay = 0;
    this.workletProcessorChannels[channel].channelVibrato.depth = 0;
}

/**
 * @param channel {number}
 * @param depth {number}
 * @param rate {number}
 * @param delay {number}
 * @this {Synthesizer}
 */
export function setVibrato(channel, depth, rate, delay)
{
    if(this.workletProcessorChannels[channel].lockVibrato)
    {
        return;
    }
    this.workletProcessorChannels[channel].vibrato.rate = rate;
    this.workletProcessorChannels[channel].vibrato.delay = delay;
    this.workletProcessorChannels[channel].vibrato.depth = depth;
}