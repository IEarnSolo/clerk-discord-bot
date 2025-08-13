// Utility to divide guild members into teams.
// Used by the /divideteams command.

export function divideTeams(guild, numberOfTeams, emoji) {
    const members = guild.members.cache
        .filter(m => !m.user.bot)
        .map(m => m.displayName);

    if (members.length === 0) {
        return 'No members found to divide into teams.';
    }

    // Shuffle members
    const shuffled = [...members].sort(() => 0.5 - Math.random());

    // Create teams
    const teams = Array.from({ length: numberOfTeams }, () => []);
    shuffled.forEach((member, index) => {
        teams[index % numberOfTeams].push(member);
    });

    // Format message
    let output = `**Teams:**\n`;
    teams.forEach((team, i) => {
        output += `\n**Team ${i + 1} ${emoji || ''}**\n${team.join('\n')}\n`;
    });

    return output;
}
