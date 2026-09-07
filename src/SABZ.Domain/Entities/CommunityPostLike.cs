namespace SABZ.Domain.Entities;

/// <summary>
/// A user's like on a community post. Each (PostId, UserId) pair is unique
/// (enforced by a unique index). Liking is idempotent: toggling removes the
/// row rather than creating a duplicate.
/// </summary>
public class CommunityPostLike
{
    public Guid Id { get; set; }
    public Guid PostId { get; set; }
    public Guid UserId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public CommunityPost Post { get; set; } = null!;
    public User User { get; set; } = null!;
}
