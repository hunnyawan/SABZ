using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SABZ.Infrastructure.Migrations;

/// <inheritdoc />
public partial class AddCommunityPostLikes : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "CommunityPostLikes",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PostId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_CommunityPostLikes", x => x.Id);
                table.ForeignKey(
                    name: "FK_CommunityPostLikes_CommunityPosts_PostId",
                    column: x => x.PostId,
                    principalTable: "CommunityPosts",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_CommunityPostLikes_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_CommunityPostLikes_PostId_UserId",
            table: "CommunityPostLikes",
            columns: new[] { "PostId", "UserId" },
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_CommunityPostLikes_UserId",
            table: "CommunityPostLikes",
            column: "UserId");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "CommunityPostLikes");
    }
}
